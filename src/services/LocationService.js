import { Alert, Platform, PermissionsAndroid } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import { version as APP_VERSION } from '../../package.json';

// V5 (v2.7.4): إعدادات افتراضية - يمكن تجاوزها لكل سائق من Firestore
// الجدول: appConfig/global (افتراضي للجميع) و appConfig/driverConfigs/drivers/{driverId} (لسائق محدد)
// ⚠️ يجب أن تطابق الافتراضيات في صفحة driver-config.html
const DEFAULT_CONFIG = {
  // ===== TAB A: BASIC (10 settings) =====
  // v2.7.10 (Option A): الافتراضيات ترجع لقيم v2.4.2 — موثوقة مع الشاشة المقفلة
  // RNBG يدير batching/elasticity تلقائياً لما القيم null (سلوك v2.4.2)
  profile: 'high',             // ultra | high | balanced | battery_saver (الاسم الجديد)
  trackingProfile: 'high',     // legacy alias - kept for back-compat
  distanceFilter: 30,                   // v2.4.2 baseline (كان 5 — كان يستهلك بطارية كثيرة)
  locationUpdateInterval: null,         // null = let RNBG batch naturally (كان 3000)
  fastestLocationUpdateInterval: null,  // null = let RNBG decide (كان 1000)
  saveDistanceMeters: 50,               // v2.4.2-style (كان 20)
  saveIntervalMs: 60000,                // v2.4.2-style (كان 30000)
  stillBackupIntervalMs: 300000,  // 5 دقايق
  desiredAccuracy: 'HIGH',     // NAVIGATION | HIGH | MEDIUM | LOW
  maxAccuracy: 50,
  maxSpeedKmh: 250,
  elasticityMultiplier: null,           // null = use RNBG smart adaptive (كان 1)
  stopTimeout: 15,                      // v2.4.2 baseline (كان hardcoded 5 — يدخل stationary بسرعة)

  // ===== TAB B: UPLOAD (11 settings) =====
  heartbeatIntervalSec: 60,
  forceSyncOnHeartbeat: true,    // الحل #2
  autoSyncThreshold: 5,
  batchSync: true,
  maxBatchSize: 50,
  compressionEnabled: false,     // الحل #12 (off by default)
  pointsPerCompressedBatch: 50,
  maxBatchAgeSec: 300,
  realtimeConfigEnabled: true,   // الحل #7
  backgroundFetchEnabled: false, // الحل #4
  backgroundFetchIntervalMin: 15,

  // ===== TAB D: WATCHDOG (5 settings) =====
  forceTrackingServiceEnabled: true,  // الحل #5
  watchdogEnabled: true,              // الحل #9
  watchdogCheckIntervalSec: 60,
  watchdogMaxDeadTimeSec: 180,
  autoRestartOnDestroy: true,

  // ===== TAB E: HEALTH (8 settings) =====
  healthReportEnabled: true,     // الحل #8
  healthReportIntervalMin: 5,
  reportBatteryLevel: true,
  reportNetworkType: true,
  reportPermissionsStatus: true,
  reportLocalQueueSize: true,
  lowBatteryAlertThreshold: 20,
  lowBatteryAdjustTracking: true,

  // ===== TAB F: SMART - Activity-Based (6 settings) =====
  activityBasedTrackingEnabled: false, // الحل #11
  inVehicleDistanceFilter: 5,
  inVehicleIntervalMs: 3000,
  onFootDistanceFilter: 10,
  onFootIntervalMs: 10000,
  stillIntervalSec: 300,

  // ===== TAB G: FILTERS (2 settings) =====
  minTimeDeltaSec: 2,            // V5 filter
  jumpDistanceThresholdM: 100,

  // ===== TAB H: DIAGNOSTICS (3 settings) =====
  diagnosticsAccessTaps: 5,      // الحل #10
  localLogsRetentionDays: 7,
  localQueueMaxRecords: 10000,
};

// كل المفاتيح اللي نقبلها من Firestore (للـ merge العام)
const ALL_CONFIG_KEYS = Object.keys(DEFAULT_CONFIG);

// v2.7.10 (Option A): البروفايلات
// - 'high' الآن = v2.4.2-compatible (موثوق مع الشاشة المقفلة، لا قيود Doze)
// - 'ultra' للتتبع العدواني فقط لما يكون الجهاز whitelisted من البطارية
const PROFILES = {
  ultra:         { distanceFilter: 5,   locationUpdateInterval: 2000, saveDistanceMeters: 15, saveIntervalMs: 20000 },
  high:          { distanceFilter: 30,  locationUpdateInterval: null, saveDistanceMeters: 50, saveIntervalMs: 60000 },  // v2.4.2 baseline
  balanced:      { distanceFilter: 50,  locationUpdateInterval: null, saveDistanceMeters: 75, saveIntervalMs: 120000 },
  battery_saver: { distanceFilter: 100, locationUpdateInterval: null, saveDistanceMeters: 150, saveIntervalMs: 300000 },
};

class LocationService {
  constructor() {
    this.isConfigured = false;
    this.isTracking = false;
    this.currentDriverId = null;
    this.lastHistorySaveTime = null;
    this.lastHistorySaveLocation = null;
    this.config = { ...DEFAULT_CONFIG };  // V5: قابل للتجاوز per-driver
    this.configListenerUnsubs = []; // v2.7.4: array للـ global+driver listeners
  }

  // V5: قراءة config من Firestore (global + driver-specific)
  // الأولوية: driver-specific > global > DEFAULT_CONFIG
  async loadConfig(driverId) {
    try {
      console.log('[LocationService] Loading config for driver:', driverId);
      const cfg = { ...DEFAULT_CONFIG };

      const applyLayer = (data, label) => {
        if (!data) return;
        // 1) profile expansion (support both 'profile' and legacy 'trackingProfile')
        const profileName = data.profile || data.trackingProfile;
        if (profileName && PROFILES[profileName]) {
          Object.assign(cfg, PROFILES[profileName]);
          cfg.profile = profileName;
          cfg.trackingProfile = profileName;
        }
        // 2) merge ALL recognized keys (49 settings)
        ALL_CONFIG_KEYS.forEach(k => {
          if (data[k] !== undefined && data[k] !== null) cfg[k] = data[k];
        });
        console.log('[LocationService] Applied', label, '— keys:', Object.keys(data).filter(k => ALL_CONFIG_KEYS.includes(k) || k==='profile' || k==='trackingProfile').length);
      };

      // 1) global config
      try {
        const globalSnap = await firestore().collection('appConfig').doc('global').get();
        if (globalSnap.exists) applyLayer(globalSnap.data(), 'global');
      } catch(e) { console.warn('[LocationService] global config load failed:', e.message); }

      // 2) driver-specific override
      try {
        const driverSnap = await firestore()
          .collection('appConfig').doc('driverConfigs')
          .collection('drivers').doc(driverId).get();
        if (driverSnap.exists) applyLayer(driverSnap.data(), `driver:${driverId}`);
      } catch(e) { console.warn('[LocationService] driver config load failed:', e.message); }

      this.config = cfg;
      console.log('[LocationService] ✅ Final config loaded (', Object.keys(cfg).length, 'keys )');

      // v2.7.8 (الحل #12): cache compression flags so HeadlessTask can read them
      try {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.multiSet([
          ['rt_cfg_compressionEnabled', String(!!cfg.compressionEnabled)],
          ['rt_cfg_pointsPerBatch', String(cfg.pointsPerCompressedBatch || 50)],
          ['rt_cfg_maxBatchAgeSec', String(cfg.maxBatchAgeSec || 300)],
        ]);
      } catch (e) { console.warn('[LocationService] cfg cache write failed:', e.message); }

      return cfg;
    } catch (e) {
      console.error('[LocationService] loadConfig error:', e.message);
      this.config = { ...DEFAULT_CONFIG };
      return this.config;
    }
  }

  // V5 (v2.7.4 - الحل #7): استمع لتغييرات global + driver-specific
  // أي تغيير من صفحة driver-config.html يطبق فوراً بدون فتح التطبيق
  subscribeToConfigChanges(driverId) {
    try {
      // أوقف أي listeners قديمة
      if (this.configListenerUnsubs && Array.isArray(this.configListenerUnsubs)) {
        this.configListenerUnsubs.forEach(u => { try { u(); } catch(_){} });
      }
      this.configListenerUnsubs = [];

      const reloadAndApply = async (source) => {
        console.log('[LocationService] 🔄 Config changed (' + source + ') - reloading');
        await this.loadConfig(driverId);
        await this.applyRuntimeConfig();
        // أرسل appVersion لـ drivers/{id} في كل تحديث (الحل #6)
        try {
          await firestore().collection('drivers').doc(driverId).set({
            appVersion: APP_VERSION,
            lastConfigSync: firestore.FieldValue.serverTimestamp(),
            lastConfigSource: source,
          }, { merge: true });
        } catch (e) { console.warn('[LocationService] appVersion update failed:', e.message); }
      };

      // 1) Listen to GLOBAL config changes
      const globalRef = firestore().collection('appConfig').doc('global');
      const globalUnsub = globalRef.onSnapshot(
        async (snap) => { if (snap.exists || snap.metadata.hasPendingWrites) await reloadAndApply('global'); },
        (e) => console.warn('[LocationService] global listener error:', e.message)
      );
      this.configListenerUnsubs.push(globalUnsub);

      // 2) Listen to DRIVER-specific config changes
      const driverRef = firestore()
        .collection('appConfig').doc('driverConfigs')
        .collection('drivers').doc(driverId);
      const driverUnsub = driverRef.onSnapshot(
        async (_snap) => { await reloadAndApply('driver:' + driverId); },
        (e) => console.warn('[LocationService] driver listener error:', e.message)
      );
      this.configListenerUnsubs.push(driverUnsub);

      console.log('[LocationService] ✅ Subscribed to global + driver:' + driverId + ' config changes');
    } catch (e) {
      console.warn('[LocationService] subscribe failed:', e.message);
    }
  }

  // V5 (v2.7.4): تطبيق config الجديد فوراً بدون إعادة تشغيل
  async applyRuntimeConfig() {
    try {
      const accuracyMap = {
        'NAVIGATION': BackgroundGeolocation.DESIRED_ACCURACY_NAVIGATION,
        'HIGH': BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        'MEDIUM': BackgroundGeolocation.DESIRED_ACCURACY_MEDIUM,
        'LOW': BackgroundGeolocation.DESIRED_ACCURACY_LOW,
      };
      const c = this.config;
      const rnbgConfig = {
        // GPS quality (Tab A)
        distanceFilter: c.distanceFilter,
        desiredAccuracy: accuracyMap[c.desiredAccuracy] || BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        heartbeatInterval: c.heartbeatIntervalSec || 60,
        // Upload (Tab B)
        autoSync: true,
        autoSyncThreshold: c.autoSyncThreshold || 5,
        batchSync: !!c.batchSync,
        maxBatchSize: c.maxBatchSize || 50,
        maxRecordsToPersist: c.localQueueMaxRecords || 10000,
      };
      // v2.7.10 (Option A): فقط مرر القيم الصريحة. null = اترك RNBG يقرر (سلوك v2.4.2)
      if (c.locationUpdateInterval != null) rnbgConfig.locationUpdateInterval = c.locationUpdateInterval;
      if (c.fastestLocationUpdateInterval != null) rnbgConfig.fastestLocationUpdateInterval = c.fastestLocationUpdateInterval;
      if (c.elasticityMultiplier != null) rnbgConfig.elasticityMultiplier = c.elasticityMultiplier;
      if (c.stopTimeout != null) rnbgConfig.stopTimeout = c.stopTimeout;
      await BackgroundGeolocation.setConfig(rnbgConfig);
      console.log('[LocationService] ✅ Runtime RNBG config applied:', JSON.stringify(rnbgConfig));
    } catch (e) {
      console.warn('[LocationService] applyRuntimeConfig failed:', e.message);
    }
  }

  async checkPermissions() {
    try {
      console.log('[LocationService] Checking permissions...');
      
      if (Platform.OS === 'android') {
        const granted = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION
        );
        
        console.log('[LocationService] Location permission granted:', granted);
        return granted;
      }
      
      return true;
    } catch (error) {
      console.error('[LocationService] Error checking permissions:', error);
      throw new Error(`فشل التحقق من الأذونات: ${error.message}`);
    }
  }

  /**
   * ✅ يطلب فعلاً جميع الأذونات اللازمة للتتبع
   * - ACCESS_FINE_LOCATION
   * - ACCESS_COARSE_LOCATION
   * - ACCESS_BACKGROUND_LOCATION (لازم منفصلة بعد ما يوافق على الموقع)
   * - POST_NOTIFICATIONS (Android 13+)
   */
  async requestPermissions() {
    if (Platform.OS !== 'android') return true;
    
    try {
      console.log('[LocationService] 🔐 Requesting all required permissions...');
      
      // 1) أذونات الموقع (FINE + COARSE) - دفعة واحدة
      const locationResults = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ]);
      
      const fineGranted = locationResults[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      const coarseGranted = locationResults[PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED;
      
      console.log('[LocationService] FINE_LOCATION:', fineGranted, '| COARSE_LOCATION:', coarseGranted);
      
      if (!fineGranted) {
        Alert.alert(
          'تفعيل الخدمة',
          'الخدمة غير مفعّلة. الرجاء تفعيل خدمة الموقع من الإعدادات لاستمرار عمل التطبيق.',
          [{ text: 'حسناً' }]
        );
        return false;
      }
      
      // 2) إشعارات (Android 13+ فقط)
      if (Platform.Version >= 33) {
        const notifResult = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
        );
        console.log('[LocationService] POST_NOTIFICATIONS:', notifResult);
      }
      
      // 3) الموقع في الخلفية (Android 10+ - لازم بعد ما يوافق على FINE)
      // ⚠️ Android 11+ ما يقدر يطلب BACKGROUND مع FINE في نفس المرة
      //    لازم طلبه منفصل، وراح يفتح الإعدادات
      if (Platform.Version >= 29) {
        const backgroundCheck = await PermissionsAndroid.check(
          PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION
        );
        
        if (!backgroundCheck) {
          // ننتظر شوي عشان dialogue الموقع يقفل أول
          await new Promise(resolve => setTimeout(resolve, 500));
          
          const backgroundResult = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.ACCESS_BACKGROUND_LOCATION,
            {
              title: 'إعدادات الخدمة',
              message: 'لاستمرار عمل الخدمة بدون انقطاع، اختر "السماح طوال الوقت"',
              buttonPositive: 'موافق',
              buttonNegative: 'لاحقاً'
            }
          );
          console.log('[LocationService] ACCESS_BACKGROUND_LOCATION:', backgroundResult);
          
          if (backgroundResult !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn('[LocationService] ⚠️ Background location not granted - tracking may stop when app is closed');
            // ما نوقف العملية، التتبع شغال في foreground على الأقل
          }
        }
      }
      
      console.log('[LocationService] ✅ All permission requests completed');
      return true;
    } catch (error) {
      console.error('[LocationService] ❌ Error requesting permissions:', error);
      Alert.alert('خطأ', 'حدث خطأ أثناء التهيئة: ' + error.message);
      return false;
    }
  }

  async configure() {
    if (this.isConfigured) {
      console.log('[LocationService] Already configured');
      return true;
    }

    try {
      console.log('[LocationService] Configuring BackgroundGeolocation...');
      
      // Check permissions first (but don't request them)
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        const errorMsg = 'صلاحية الموقع غير ممنوحة. يجب منح الصلاحية من الإعدادات.';
        console.error('[LocationService]', errorMsg);
        throw new Error(errorMsg);
      }
      
      // Request notification permission for Android 13+ (API 33+)
      if (Platform.OS === 'android' && Platform.Version >= 33) {
        console.log('[LocationService] Requesting notification permission for Android 13+...');
        try {
          const notificationPermission = await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
          
          if (notificationPermission !== PermissionsAndroid.RESULTS.GRANTED) {
            console.warn('[LocationService] Notification permission not granted - notifications may not work');
            // يمكن المتابعة، لكن قد لا تعمل الإشعارات
          } else {
            console.log('[LocationService] Notification permission granted');
          }
        } catch (notifError) {
          console.error('[LocationService] Error requesting notification permission:', notifError);
          // المتابعة على أي حال
        }
      }
      
      // Configure BackgroundGeolocation with proper settings
      // Small delay to ensure system is ready
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // V5 (v2.7.0): تطبيق config المحمّل من Firestore (مع fallback للقيم الافتراضية)
      const accuracyMap = {
        'NAVIGATION': BackgroundGeolocation.DESIRED_ACCURACY_NAVIGATION,
        'HIGH': BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        'MEDIUM': BackgroundGeolocation.DESIRED_ACCURACY_MEDIUM,
        'LOW': BackgroundGeolocation.DESIRED_ACCURACY_LOW,
      };
      console.log('[LocationService] Calling BackgroundGeolocation.ready() with config:', JSON.stringify(this.config));

      // v2.7.10 (Option A): بناء كائن config ديناميكي
      // null = اترك RNBG يقرر (سلوك v2.4.2 الموثوق مع الشاشة المقفلة)
      const c = this.config;
      const readyConfig = {
        // ===== GEOLOCATION CONFIG =====
        desiredAccuracy: accuracyMap[c.desiredAccuracy] || BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        distanceFilter: c.distanceFilter,

        // heartbeat كل 60 ثانية — يحدث lastUpdate في drivers/<id>
        heartbeatInterval: c.heartbeatIntervalSec || 60,
        
        // Application config
        debug: false, // Disable debug sounds - set to false to stop all sound effects
        logLevel: BackgroundGeolocation.LOG_LEVEL_VERBOSE,
        stopOnTerminate: false,
        startOnBoot: true,
        
        // IMPORTANT: foregroundService is REQUIRED for Android 8+
        foregroundService: true,
        
        // Enable headless mode for background operation
        enableHeadless: true,
        
        // REQUIRED notification for foreground service (Android 8+)
        // Stealth notification - completely hidden from notification bar
        notification: {
          title: '',  // فارغ تماماً
          text: '',   // فارغ تماماً
          channelName: ' ',  // مسافة واحدة - لتفعيل autoCancel و timeoutAfter
          channelId: 'bg_service',
          priority: BackgroundGeolocation.NOTIFICATION_PRIORITY_MIN,
          importance: 0,  // ← IMPORTANCE_NONE - إخفاء تام
          smallIcon: 'mipmap/ic_launcher',
          largeIcon: '',
          color: '#00000000',  // شفاف
          silent: true,
          sticky: false,
          ongoing: false,  // ليس مستمر - يمكن إخفاؤه تلقائياً
          
          // ✅ منع فتح التطبيق عند الضغط على الإشعار
          actions: [],
          
          // ✅ إخفاء الإشعار من شريط الإشعارات
          visibility: 0,  // VISIBILITY_SECRET - مخفي تماماً
          
          // ✅ إخفاء تلقائي بعد ثانية واحدة
          autoCancel: true,
          timeoutAfter: 1000,  // 1000ms = ثانية واحدة
        },
        
        // Permission settings
        locationAuthorizationRequest: 'Always',
        backgroundPermissionRationale: {
          title: 'إعدادات الخدمة',
          message: 'لاستمرار عمل الخدمة بدون انقطاع، اختر "السماح طوال الوقت"',
          positiveAction: 'تغيير إلى "{backgroundPermissionOptionLabel}"',
          negativeAction: 'إلغاء',
        },
        
        // ===== OFFLINE STORAGE & SYNC =====
        // C3: تجميع المواقع قبل الرفع لتقليل network calls و Firestore writes
        // كل 5 locations تتجمع في batch واحد ثم ترفع. عند انقطاع الشبكة،
        // SQLite تخزن المواقع وترفعها لما الشبكة ترجع.
        autoSync: true,              // Auto-sync to server when online
        autoSyncThreshold: 5,        // تجميع 5 مواقع قبل الإرسال (كان 1)
        batchSync: true,             // batch المواقع المتعددة في request واحد (كان false)
        maxBatchSize: 50,            // Max 50 locations per batch
        maxDaysToPersist: 7,         // Keep locations for 7 days
        maxRecordsToPersist: 10000,  // Max 10k records in SQLite
        
        // ===== ACTIVITY RECOGNITION & SMART STOP DETECTION =====
        // V3 PRO: استغلال activity recognition من Google Play Services
        // (still / on_foot / on_bicycle / in_vehicle / running)
        stopDetectionDelay: 1,                // ابدأ تحليل التوقف بعد دقيقة واحدة من الثبات

        // ===== MOTION DETECTION =====
        preventSuspend: true,                 // منع تعليق التطبيق
        pausesLocationUpdatesAutomatically: false, // ما توقف لما السائق ساكن (نتحكم بنفسنا)
      };

      // v2.7.10 (Option A): القيم الاختيارية — null = اترك RNBG يقرر (سلوك v2.4.2)
      if (c.locationUpdateInterval != null) readyConfig.locationUpdateInterval = c.locationUpdateInterval;
      if (c.fastestLocationUpdateInterval != null) readyConfig.fastestLocationUpdateInterval = c.fastestLocationUpdateInterval;
      if (c.elasticityMultiplier != null) readyConfig.elasticityMultiplier = c.elasticityMultiplier;
      readyConfig.stopTimeout = c.stopTimeout || 15;  // v2.4.2 baseline = 15 دقيقة

      const state = await BackgroundGeolocation.ready(readyConfig);

      console.log('[LocationService] Configuration successful');
      console.log('[LocationService] BackgroundGeolocation state:', JSON.stringify(state));
      this.isConfigured = true;
      
      // Register location listener
      console.log('[LocationService] Registering location listeners...');
      BackgroundGeolocation.onLocation(this.onLocation.bind(this), this.onLocationError.bind(this));
      
      // C3: تسجيل heartbeat handler — يحدث lastUpdate كل دقيقة
      // عشان Cloud Function ما تظن السائق توقف عن التتبع لو وقف
      BackgroundGeolocation.onHeartbeat(this.onHeartbeat.bind(this));

      // v2.7.6 (الحل #11): Activity-based tracking
      BackgroundGeolocation.onActivityChange(this.onActivityChange.bind(this));
      console.log('[LocationService] Location listeners + heartbeat + activity registered');
      
      return true;
    } catch (error) {
      console.error('[LocationService] Configuration error:', error);
      console.error('[LocationService] Error message:', error.message);
      console.error('[LocationService] Error stack:', error.stack);
      
      // Throw error with Arabic message
      throw new Error(`فشل إعداد الخدمة: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  async start(driverId) {
    try {
      console.log('[LocationService] Starting tracking for driver:', driverId);
      
      if (!driverId) {
        const errorMsg = 'معرف السائق مفقود';
        console.error('[LocationService]', errorMsg);
        throw new Error(errorMsg);
      }

      // Convert to string to ensure compatibility
      this.currentDriverId = String(driverId);
      
      // Check permissions before starting (but don't request)
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        const errorMsg = 'الخدمة غير مفعّلة';
        console.error('[LocationService]', errorMsg);
        throw new Error(errorMsg);
      }
      
      // V5 (v2.7.0): تحميل config من Firestore قبل configure
      await this.loadConfig(this.currentDriverId);
      
      // Configure if not already configured
      if (!this.isConfigured) {
        console.log('[LocationService] Not configured, configuring now...');
        await this.configure();
      } else {
        // V5: لو تم configure مسبقاً، طبّق القيم الجديدة فوراً
        await this.applyRuntimeConfig();
      }
      
      // V5: اشترك بتغييرات config (لتطبيق التحديثات بدون إعادة تشغيل)
      this.subscribeToConfigChanges(this.currentDriverId);

      // Check current state before starting
      console.log('[LocationService] Checking current state...');
      const state = await BackgroundGeolocation.getState();
      console.log('[LocationService] Current state:', JSON.stringify(state));
      
      // If already enabled, stop it first to avoid conflicts
      if (state.enabled) {
        console.log('[LocationService] Service already running, stopping first...');
        await BackgroundGeolocation.stop();
        await new Promise(resolve => setTimeout(resolve, 1000));
        console.log('[LocationService] Service stopped, will restart now');
      }

      // Create/update driver document in drivers collection
      // v2.7.4 (الحل #6): كتابة appVersion تلقائياً في كل بدء تشغيل
      console.log('[LocationService] Creating/updating driver document with appVersion:', APP_VERSION);
      try {
        await firestore()
          .collection('drivers')
          .doc(this.currentDriverId)
          .set({
            driverId: this.currentDriverId,
            isActive: true,
            lastUpdate: new Date(),
            appVersion: APP_VERSION,
            lastAppStart: firestore.FieldValue.serverTimestamp(),
            platform: Platform.OS,
            platformVersion: String(Platform.Version),
          }, { merge: true });
        console.log('[LocationService] Driver document created/updated successfully with version', APP_VERSION);
      } catch (docError) {
        console.error('[LocationService] Error creating driver document:', docError);
        throw new Error(`فشل إنشاء سجل السائق في قاعدة البيانات: ${docError.message}`);
      }

      // Start tracking
      console.log('[LocationService] Calling BackgroundGeolocation.start()...');
      await BackgroundGeolocation.start();
      
      this.isTracking = true;
      console.log('[LocationService] Tracking started successfully');
      
      // Update driver status in Firestore
      await this.updateDriverStatus(true);

      // v2.7.5 (الحل #8): شغل health monitoring
      this.startHealthMonitoring();
      
      return true;
    } catch (error) {
      console.error('[LocationService] Start error:', error);
      console.error('[LocationService] Error message:', error.message);
      console.error('[LocationService] Error stack:', error.stack);
      
      // Throw error to be caught by MainScreen
      throw new Error(`فشل بدء الخدمة: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  async stop() {
    // ⚠️ التتبع يجب أن يستمر - لا يمكن إيقافه
    console.warn('[LocationService] ⚠️ stop() called but tracking must continue');
    console.warn('[LocationService] Tracking cannot be stopped for continuous monitoring');
    
    // لا تفعل شيء - التتبع يستمر
    return false;
  }
  
  /**
   * إيقاف التتبع فعلياً (فقط للإدارة)
   * لا يجب استخدامه في الكود العادي
   */
  async forceStop() {
    try {
      console.log('[LocationService] Force stopping tracking...');
      
      await BackgroundGeolocation.stop();
      this.isTracking = false;
      
      // Update driver status in Firestore
      await this.updateDriverStatus(false);
      
      console.log('[LocationService] Tracking force stopped');
      return true;
    } catch (error) {
      console.error('[LocationService] Force stop error:', error);
      throw new Error(`فشل إيقاف الخدمة: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  // V4 PRO (v2.6.0): حفظ ذكي محسّن - يقلل النقاط بنسبة 70-80% بدون فقدان معلومة
  //
  // الفلسفة:
  //   1. منع التكرار التام: لو نفس المكان (<5م) في نفس الـ 5 ثوان → ارفض
  //   2. السائق متحرك (isMoving=true): احفظ كل 50م أو 90 ثانية
  //   3. السائق متوقف فعلاً (isMoving=false + still): نقطة كل 30 دقيقة فقط
  //   4. تغيّر الحالة (movement→stop أو العكس): احفظ فوراً (نقطة دخول/خروج)
  shouldSaveToHistory(location) {
    const now = Date.now();
    const currentLat = location.coords.latitude;
    const currentLng = location.coords.longitude;
    const currentSpeed = location.coords.speed ?? 0;
    // V4: نعتمد على is_moving من Activity Recognition (أدق من السرعة وحدها)
    const isMoving = location.is_moving === true || currentSpeed >= 0.83; // 3 km/h
    const activityType = (location.activity && location.activity.type) || 'unknown';
    const isStill = activityType === 'still';
    
    // أول نقطة دائماً تحفظ
    if (!this.lastHistorySaveTime || !this.lastHistorySaveLocation) {
      this.lastIsMoving = isMoving;
      return true;
    }
    
    const timeDiff = now - this.lastHistorySaveTime;
    const wasMoving = this.lastIsMoving === true;
    
    // 🛑 V4: منع التكرار - نفس المكان (<5م) في نفس الـ 5 ثوان
    const distFromLast = this.calculateDistance(
      this.lastHistorySaveLocation.latitude,
      this.lastHistorySaveLocation.longitude,
      currentLat, currentLng
    );
    if (distFromLast < 5 && timeDiff < 5000) {
      console.log('[shouldSaveToHistory] Duplicate point - skipping');
      return false;
    }
    
    // 🚦 احفظ نقطة "تغيّر حالة" - من حركة لتوقف أو العكس
    if (wasMoving !== isMoving) {
      console.log(`[shouldSaveToHistory] State change: moving=${wasMoving}→${isMoving} - saving transition`);
      this.lastIsMoving = isMoving;
      return true;
    }
    
    // 🛑 السائق متوقف فعلاً
    if (!isMoving || isStill) {
      // V5 (v2.7.0): backup interval قابل للتعديل من Firestore
      const stillBackup = this.config.stillBackupIntervalMs || 1800000;
      if (timeDiff >= stillBackup) {
        console.log(`[shouldSaveToHistory] Stopped > ${stillBackup/60000}min - backup point`);
        return true;
      }
      return false;
    }
    
    // 🚗 V5 (v2.7.0): السائق يتحرك: احفظ كل saveIntervalMs أو saveDistanceMeters
    const saveInterval = this.config.saveIntervalMs || 30000;
    const saveDist = this.config.saveDistanceMeters || 20;
    if (timeDiff >= saveInterval) {
      console.log(`[shouldSaveToHistory] Moving - ${saveInterval/1000}s elapsed`);
      return true;
    }
    
    if (distFromLast >= saveDist) {
      console.log(`[shouldSaveToHistory] Moving - ${Math.round(distFromLast)}m (>= ${saveDist}م)`);
      return true;
    }
    
    return false;
  }
  
  // Calculate distance between two coordinates in meters (Haversine formula)
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth radius in meters
    const φ1 = lat1 * Math.PI / 180;
    const φ2 = lat2 * Math.PI / 180;
    const Δφ = (lat2 - lat1) * Math.PI / 180;
    const Δλ = (lon2 - lon1) * Math.PI / 180;
    
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
  }

  async onLocation(location) {
    try {
      const speed = location.coords.speed ?? 0;
      const accuracy = location.coords.accuracy ?? 999;
      const isMoving = location.is_moving === true || speed >= 0.83;
      const activity = (location.activity && location.activity.type) || 'unknown';
      const activityConfidence = (location.activity && location.activity.confidence) || 0;
      
      console.log('[LocationService] Location received:', {
        speed: speed.toFixed(2),
        accuracy: accuracy.toFixed(1),
        isMoving,
        activity,
        confidence: activityConfidence
      });
      
      // ===== V5 QUALITY FILTERS (v2.7.0) =====
      // V5: حدود الجودة قابلة للتعديل من Firestore لكل سائق
      const maxAcc = this.config.maxAccuracy || 50;
      const maxKmh = this.config.maxSpeedKmh || 200;
      // 1) رفض النقاط الرديئة (دقة > maxAcc م)
      if (accuracy > maxAcc) {
        console.warn(`[LocationService] ❌ Rejected: poor accuracy (${accuracy.toFixed(0)}م > ${maxAcc}م)`);
        return;
      }
      // 2) رفض السرعات الوهمية
      const speedKmh = speed * 3.6;
      if (speedKmh > maxKmh) {
        console.warn(`[LocationService] ❌ Rejected: impossible speed (${speedKmh.toFixed(0)} km/h > ${maxKmh})`);
        return;
      }
      
      if (!this.currentDriverId) {
        console.warn('[LocationService] No driver ID set, skipping location save');
        return;
      }

      // ✅ تحديث الـ driver document (للعرض الحي في الإدارة)
      await firestore()
        .collection('drivers')
        .doc(this.currentDriverId)
        .set({
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: speed,
            heading: location.coords.heading || 0,
          },
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: speed,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading || -1,
          isMoving: isMoving,                    // V3: حالة الحركة
          currentActivity: activity,             // V3: النشاط الحالي (in_vehicle/still/walking/etc)
          activityConfidence: activityConfidence,
          lastUpdate: new Date(),
          isActive: true,
        }, { merge: true });

      console.log('[LocationService] Driver document updated');
      
      // 💾 حفظ في locationHistory فقط إذا الشروط موجودة
      if (this.shouldSaveToHistory(location)) {
        try {
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 60);

          // v2.7.8 (الحل #12): compression branch
          const compressionEnabled = !!(this.config && this.config.compressionEnabled);

          if (compressionEnabled) {
            // COMPRESSED: buffer + flush
            await this._bufferAndFlushCompressed({
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 0,
              speed: speed,
              heading: location.coords.heading || 0,
              isMoving: isMoving,
              activity: activity,
              currentActivity: activity,
              activityConfidence: activityConfidence,
              timestamp: Date.now(),
              deviceTimestamp: Date.now(),
            }, expiryDate, 'active');
          } else {
            // LEGACY: 1 doc per point
            await firestore()
              .collection('locationHistory')
              .add({
                driverId: this.currentDriverId,
                latitude: location.coords.latitude,
                longitude: location.coords.longitude,
                accuracy: location.coords.accuracy || 0,
                speed: speed,
                heading: location.coords.heading || 0,
                isMoving: isMoving,
                activity: activity,
                activityConfidence: activityConfidence,
                timestamp: new Date(),
                expiryDate: expiryDate,
                appState: 'active',
                userId: this.currentDriverId,
              });
            console.log('[LocationService] History point saved (legacy)');
          }

          this.lastHistorySaveTime = Date.now();
          this.lastHistorySaveLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
        } catch (historyError) {
          console.error('[LocationService] Error saving to history:', historyError);
        }
      }
    } catch (error) {
      console.error('[LocationService] Error saving location:', error);
    }
  }

  onLocationError(error) {
    console.error('[LocationService] Location error:', error);
  }

  /**
   * v2.7.8 (الحل #12): buffer points in AsyncStorage, flush as 1 doc to locationHistoryBatched
   * v2.7.9 (الإصلاح #1): مفاتيح AsyncStorage مربوطة بـ driverId لمنع أي تداخل
   *   Keys: compressed_buffer_${driverId} / compressed_buffer_started_at_${driverId}
   */
  async _bufferAndFlushCompressed(point, expiryDate, appState) {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const cfg = this.config || {};
      const pointsPerBatch = cfg.pointsPerCompressedBatch || 50;
      const maxBatchAgeSec = cfg.maxBatchAgeSec || 300;

      // v2.7.9: مفاتيح خاصة بالسائق
      const driverId = this.currentDriverId;
      if (!driverId) {
        console.warn('[Compress] no currentDriverId — skip buffering');
        return;
      }
      const bufKey = `compressed_buffer_${driverId}`;
      const startKey = `compressed_buffer_started_at_${driverId}`;

      const bufferRaw = await AsyncStorage.getItem(bufKey);
      let buffer = [];
      if (bufferRaw) { try { buffer = JSON.parse(bufferRaw); } catch (_) { buffer = []; } }
      let startedAt = parseInt(await AsyncStorage.getItem(startKey) || '0', 10);
      if (buffer.length === 0) startedAt = Date.now();

      buffer.push(point);
      const ageSec = (Date.now() - startedAt) / 1000;
      const shouldFlush = buffer.length >= pointsPerBatch || ageSec >= maxBatchAgeSec;

      if (shouldFlush) {
        const firstTs = buffer[0].timestamp;
        const lastTs = buffer[buffer.length - 1].timestamp;
        const minLat = Math.min(...buffer.map(p => p.latitude));
        const maxLat = Math.max(...buffer.map(p => p.latitude));
        const minLng = Math.min(...buffer.map(p => p.longitude));
        const maxLng = Math.max(...buffer.map(p => p.longitude));
        const avgSpeed = buffer.reduce((s, p) => s + (p.speed||0), 0) / buffer.length;
        const maxSpeed = Math.max(...buffer.map(p => p.speed || 0));

        await firestore().collection('locationHistoryBatched').add({
          driverId: this.currentDriverId,
          userId: this.currentDriverId,
          format: 'batched_v1',
          pointsCount: buffer.length,
          startTimestamp: new Date(firstTs),
          endTimestamp: new Date(lastTs),
          durationSec: Math.round((lastTs - firstTs) / 1000),
          bounds: { minLat, maxLat, minLng, maxLng },
          avgSpeed: avgSpeed,
          maxSpeed: maxSpeed,
          firstLocation: { latitude: buffer[0].latitude, longitude: buffer[0].longitude },
          lastLocation: { latitude: buffer[buffer.length-1].latitude, longitude: buffer[buffer.length-1].longitude },
          points: buffer,
          uploadedAt: new Date(),
          expiryDate: expiryDate,
          appState: appState || 'active',
        });

        console.log('[Compress] ✅ Flushed batch of', buffer.length, 'points for driver', driverId);
        await AsyncStorage.setItem(bufKey, '[]');
        await AsyncStorage.setItem(startKey, '0');
      } else {
        await AsyncStorage.setItem(bufKey, JSON.stringify(buffer));
        await AsyncStorage.setItem(startKey, String(startedAt));
        console.log('[Compress] buffered', buffer.length, '/', pointsPerBatch, 'for', driverId);
      }
    } catch (e) {
      console.error('[Compress] error:', e.message);
    }
  }
  
  /**
   * C3: Heartbeat — يطلق كل 60 ثانية حتى لو السائق متوقف
   * يحدث lastUpdate فقط (بدون locationHistory write)
   * هذا يبقي monitorDrivers Cloud Function راضية ويوفر آلاف الـ writes
   */
  async onHeartbeat(event) {
    try {
      if (!this.currentDriverId) {
        return;
      }
      
      console.log('[LocationService] Heartbeat — pinging lastUpdate');
      
      // تحديث خفيف فقط — مجرد إثبات أن التطبيق شغال
      const updateData = {
        lastUpdate: new Date(),
        isActive: true,
        appVersion: APP_VERSION,
      };
      
      // إذا الـ heartbeat جاب موقع محدث، نحدثه أيضاً (بدون حفظ في history)
      if (event && event.location && event.location.coords) {
        updateData.latitude = event.location.coords.latitude;
        updateData.longitude = event.location.coords.longitude;
        updateData.speed = event.location.coords.speed || 0;
        updateData.accuracy = event.location.coords.accuracy;
        updateData.heading = event.location.coords.heading || -1;
        updateData.location = {
          latitude: event.location.coords.latitude,
          longitude: event.location.coords.longitude,
          accuracy: event.location.coords.accuracy,
          speed: event.location.coords.speed || 0,
          heading: event.location.coords.heading || 0,
        };
      }
      
      await firestore()
        .collection('drivers')
        .doc(this.currentDriverId)
        .set(updateData, { merge: true });
      
      console.log('[LocationService] Heartbeat ping saved');

      // v2.7.5 (الحل #2): فرض رفع أي نقاط محلية متراكمة
      if (this.config.forceSyncOnHeartbeat !== false) {
        try {
          const syncCount = await BackgroundGeolocation.getCount();
          if (syncCount > 0) {
            console.log('[LocationService] Heartbeat sync — uploading', syncCount, 'queued records');
            await BackgroundGeolocation.sync();
            console.log('[LocationService] ✅ Heartbeat sync complete');
          }
        } catch (syncErr) {
          console.warn('[LocationService] Heartbeat sync failed:', syncErr.message);
        }
      }
    } catch (error) {
      console.error('[LocationService] Heartbeat error:', error);
      // لا نرمي الخطأ — heartbeat اختياري
    }
  }

  // v2.7.6 (الحل #11): Activity-Based Tracking
  // يبدّل إعدادات RNBG حسب نشاط السائق (in_vehicle / on_foot / still / unknown)
  async onActivityChange(event) {
    try {
      if (!event || !event.activity) return;
      const activity = event.activity; // 'in_vehicle' | 'on_foot' | 'still' | 'on_bicycle' | 'running' | 'walking' | 'unknown'
      const confidence = event.confidence || 0;
      console.log('[Activity]', activity, '(confidence:', confidence + '%)');

      this.lastActivity = activity;
      this.lastActivityConfidence = confidence;

      const cfg = this.config;
      if (!cfg.activityBasedTrackingEnabled) {
        return; // feature disabled
      }
      if (confidence < 70) {
        console.log('[Activity] confidence too low — ignoring');
        return;
      }

      // اختر الـ profile المناسب حسب النشاط
      let newConfig = null;
      let label = '';
      if (activity === 'in_vehicle') {
        newConfig = {
          distanceFilter: cfg.inVehicleDistanceFilter || 5,
          locationUpdateInterval: cfg.inVehicleIntervalMs || 3000,
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        };
        label = 'in_vehicle';
      } else if (activity === 'on_foot' || activity === 'walking' || activity === 'running' || activity === 'on_bicycle') {
        newConfig = {
          distanceFilter: cfg.onFootDistanceFilter || 10,
          locationUpdateInterval: cfg.onFootIntervalMs || 10000,
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_MEDIUM,
        };
        label = 'on_foot';
      } else if (activity === 'still') {
        newConfig = {
          distanceFilter: 50,
          locationUpdateInterval: (cfg.stillIntervalSec || 300) * 1000,
          desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_LOW,
        };
        label = 'still';
      }

      if (newConfig) {
        await BackgroundGeolocation.setConfig(newConfig);
        console.log('[Activity] ✅ Switched to', label, 'profile:', JSON.stringify(newConfig));
        // log to Firestore (lightweight)
        if (this.currentDriverId) {
          firestore().collection('drivers').doc(this.currentDriverId).set({
            currentActivity: activity,
            currentActivityConfidence: confidence,
            currentActivityProfile: label,
            currentActivityAt: firestore.FieldValue.serverTimestamp(),
          }, { merge: true }).catch(() => {});
        }
      }
    } catch (e) {
      console.warn('[Activity] handler error:', e.message);
    }
  }

  // v2.7.5 (الحل #8): Health Monitoring — كل 5 دقائق
  // يكتب في driverHealth/{driverId}: battery, network, queue, permissions, uptime
  startHealthMonitoring() {
    try {
      if (this.config.healthReportEnabled === false) {
        console.log('[LocationService] 🏥 Health monitoring disabled by config');
        return;
      }
      if (this.healthInterval) clearInterval(this.healthInterval);
      const intervalMs = (this.config.healthReportIntervalMin || 5) * 60 * 1000;
      console.log('[LocationService] 🏥 Starting health monitoring every', intervalMs/1000, 's');
      
      // run once immediately
      this.collectAndPushHealth().catch(e => console.warn('[Health] initial check failed:', e.message));
      
      this.healthInterval = setInterval(() => {
        this.collectAndPushHealth().catch(e => console.warn('[Health] periodic check failed:', e.message));
      }, intervalMs);
    } catch (e) {
      console.warn('[LocationService] startHealthMonitoring failed:', e.message);
    }
  }

  stopHealthMonitoring() {
    if (this.healthInterval) {
      clearInterval(this.healthInterval);
      this.healthInterval = null;
      console.log('[LocationService] 🏥 Health monitoring stopped');
    }
  }

  async collectAndPushHealth() {
    if (!this.currentDriverId) return;
    if (this.config.healthReportEnabled === false) return;
    
    const health = {
      driverId: this.currentDriverId,
      timestamp: firestore.FieldValue.serverTimestamp(),
      appVersion: APP_VERSION,
      platform: Platform.OS,
      platformVersion: String(Platform.Version),
    };

    // Battery & device info
    try {
      const DeviceInfo = require('react-native-device-info').default;
      health.batteryLevel = await DeviceInfo.getBatteryLevel(); // 0..1
      health.isBatteryCharging = await DeviceInfo.isBatteryCharging();
      health.powerState = await DeviceInfo.getPowerState();
      health.deviceModel = DeviceInfo.getModel();
      health.deviceBrand = DeviceInfo.getBrand();
      health.systemVersion = DeviceInfo.getSystemVersion();
      health.totalMemory = await DeviceInfo.getTotalMemory();
      health.usedMemory = await DeviceInfo.getUsedMemory();
      health.freeDiskStorage = await DeviceInfo.getFreeDiskStorage();
      try { health.isLocationEnabled = await DeviceInfo.isLocationEnabled(); } catch(_){}
      try { health.isAirplaneMode = await DeviceInfo.isAirplaneMode(); } catch(_){}
    } catch (e) { health.deviceInfoError = e.message; }

    // RNBG queue + state
    try {
      health.queueCount = await BackgroundGeolocation.getCount();
      const state = await BackgroundGeolocation.getState();
      health.rnbgEnabled = state.enabled;
      health.rnbgIsMoving = state.isMoving;
      health.rnbgTrackingMode = state.trackingMode;
      health.rnbgOdometer = state.odometer;
    } catch (e) { health.rnbgError = e.message; }

    // Permissions
    try {
      const granted = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      health.fineLocationPermission = granted;
      const bgGranted = await PermissionsAndroid.check('android.permission.ACCESS_BACKGROUND_LOCATION').catch(() => null);
      health.backgroundLocationPermission = bgGranted;
    } catch (e) { health.permissionsError = e.message; }

    // Service uptime
    health.isTracking = this.isTracking;
    health.activeProfile = this.config.profile || this.config.trackingProfile || 'unknown';

    try {
      await firestore().collection('driverHealth').doc(this.currentDriverId).set(health, { merge: true });
      console.log('[Health] ✅ Pushed: batt=' + (health.batteryLevel*100|0) + '% queue=' + health.queueCount);
    } catch (e) {
      console.warn('[Health] write failed:', e.message);
    }
  }

  async updateDriverStatus(isActive) {
    try {
      if (!this.currentDriverId) {
        return;
      }

      await firestore()
        .collection('drivers')
        .doc(this.currentDriverId)
        .update({
          isActive: isActive,
          lastUpdate: new Date(),
        });

      console.log('[LocationService] Driver status updated:', isActive);
    } catch (error) {
      console.error('[LocationService] Error updating driver status:', error);
      // Don't throw - just log the error
    }
  }

  async getCurrentPosition() {
    try {
      console.log('[LocationService] Getting current position...');
      
      // Check permissions first
      const hasPermission = await this.checkPermissions();
      if (!hasPermission) {
        throw new Error('الخدمة غير مفعّلة');
      }
      
      // Configure if not already configured
      if (!this.isConfigured) {
        console.log('[LocationService] Not configured, configuring now...');
        await this.configure();
      }
      
      const location = await BackgroundGeolocation.getCurrentPosition({
        timeout: 30,
        maximumAge: 5000,
        desiredAccuracy: 10,
        samples: 1,
      });
      
      console.log('[LocationService] Current position:', location.coords);
      return location;
    } catch (error) {
      console.error('[LocationService] Error getting current position:', error);
      throw new Error(`فشل تحديث الخدمة: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  getState() {
    return {
      isConfigured: this.isConfigured,
      isTracking: this.isTracking,
      currentDriverId: this.currentDriverId,
    };
  }
}

export default new LocationService();

