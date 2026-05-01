import { Alert, Platform, PermissionsAndroid } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';
import { version as APP_VERSION } from '../../package.json';

// V5 (v2.7.4): إعدادات افتراضية - يمكن تجاوزها لكل سائق من Firestore
// الجدول: appConfig/global (افتراضي للجميع) و appConfig/driverConfigs/drivers/{driverId} (لسائق محدد)
// ⚠️ يجب أن تطابق الافتراضيات في صفحة driver-config.html
const DEFAULT_CONFIG = {
  // ===== TAB A: BASIC (10 settings) =====
  profile: 'high',             // ultra | high | balanced | battery_saver (الاسم الجديد)
  trackingProfile: 'high',     // legacy alias - kept for back-compat
  distanceFilter: 5,
  locationUpdateInterval: 3000,
  fastestLocationUpdateInterval: 1000,
  saveDistanceMeters: 20,
  saveIntervalMs: 30000,
  stillBackupIntervalMs: 300000,  // 5 دقايق (كان 30 دقيقة)
  desiredAccuracy: 'HIGH',     // NAVIGATION | HIGH | MEDIUM | LOW
  maxAccuracy: 50,
  maxSpeedKmh: 250,
  elasticityMultiplier: 1,

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

const PROFILES = {
  ultra: { distanceFilter: 5, locationUpdateInterval: 2000, saveDistanceMeters: 15, saveIntervalMs: 20000 },
  high: { distanceFilter: 5, locationUpdateInterval: 3000, saveDistanceMeters: 20, saveIntervalMs: 30000 },
  balanced: { distanceFilter: 10, locationUpdateInterval: 5000, saveDistanceMeters: 30, saveIntervalMs: 60000 },
  battery_saver: { distanceFilter: 25, locationUpdateInterval: 10000, saveDistanceMeters: 50, saveIntervalMs: 120000 },
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
        locationUpdateInterval: c.locationUpdateInterval,
        fastestLocationUpdateInterval: c.fastestLocationUpdateInterval,
        elasticityMultiplier: c.elasticityMultiplier,
        desiredAccuracy: accuracyMap[c.desiredAccuracy] || BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        heartbeatInterval: c.heartbeatIntervalSec || 60,
        // Upload (Tab B)
        autoSync: true,
        autoSyncThreshold: c.autoSyncThreshold || 5,
        batchSync: !!c.batchSync,
        maxBatchSize: c.maxBatchSize || 50,
        maxRecordsToPersist: c.localQueueMaxRecords || 10000,
      };
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
      const state = await BackgroundGeolocation.ready({
        // ===== GEOLOCATION CONFIG (v2.7.0) =====
        // V5: قيم تأتي من this.config (Firestore أو DEFAULT_CONFIG)
        desiredAccuracy: accuracyMap[this.config.desiredAccuracy] || BackgroundGeolocation.DESIRED_ACCURACY_NAVIGATION,
        distanceFilter: this.config.distanceFilter,
        disableElasticity: false,
        elasticityMultiplier: this.config.elasticityMultiplier,
        locationUpdateInterval: this.config.locationUpdateInterval,
        fastestLocationUpdateInterval: this.config.fastestLocationUpdateInterval,
        
        // C3: heartbeat كل 60 ثانية — يحدث lastUpdate في drivers/<id>
        // عشان monitorDrivers Cloud Function ما تظن السائق توقف عن التتبع
        // (بدون كتابة جديدة في locationHistory — فقط ping خفيف)
        heartbeatInterval: 60,
        
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
        stopTimeout: 5,                       // اعتبر السائق متوقف بعد 5 دقائق من السكون
        stopDetectionDelay: 1,                // ابدأ تحليل التوقف بعد دقيقة واحدة من الثبات
        disableStopDetection: false,          // فعل اكتشاف التوقف الذكي
        disableMotionActivityUpdates: false,  // فعل activity recognition (driving/walking/still)
        activityRecognitionInterval: 10000,   // افحص النشاط كل 10 ثوان
        minimumActivityConfidence: 60,        // ثقة 60%+ لتغيير الحالة
        
        // ===== V4 STATIONARY GEOFENCE (v2.6.0) =====
        // Transistor ينشئ تلقائياً geofence حول الموقع الحالي لما السائق يتوقف
        // لما السائق يتحرك خارج هذا الـ geofence → يبدأ التتبع تلقائياً
        // الفائدة: توفير بطارية كبير لما السائق نائم في المنزل
        stationaryRadius: 50,                 // 50م حول نقطة التوقف (الافتراضي 25م)
        
        // ===== MOTION DETECTION =====
        preventSuspend: true,                 // منع تعليق التطبيق
        useSignificantChangesOnly: false,     // استخدم كل التحديثات
        pausesLocationUpdatesAutomatically: false, // ما توقف لما السائق ساكن (نتحكم بنفسنا)
      });

      console.log('[LocationService] Configuration successful');
      console.log('[LocationService] BackgroundGeolocation state:', JSON.stringify(state));
      this.isConfigured = true;
      
      // Register location listener
      console.log('[LocationService] Registering location listeners...');
      BackgroundGeolocation.onLocation(this.onLocation.bind(this), this.onLocationError.bind(this));
      
      // C3: تسجيل heartbeat handler — يحدث lastUpdate كل دقيقة
      // عشان Cloud Function ما تظن السائق توقف عن التتبع لو وقف
      BackgroundGeolocation.onHeartbeat(this.onHeartbeat.bind(this));
      console.log('[LocationService] Location listeners + heartbeat registered');
      
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
          // V3: تاريخ انتهاء = شهرين (60 يوم) - يطابق سياسة الاحتفاظ في cleanup script
          const expiryDate = new Date();
          expiryDate.setDate(expiryDate.getDate() + 60);
          
          await firestore()
            .collection('locationHistory')
            .add({
              driverId: this.currentDriverId,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 0,
              speed: speed,
              heading: location.coords.heading || 0,
              isMoving: isMoving,              // V3: مهم لحساب ساعات القيادة الحقيقية
              activity: activity,              // V3: نوع النشاط
              activityConfidence: activityConfidence,
              timestamp: new Date(),
              expiryDate: expiryDate,          // V3: 30 يوم بدلاً من 60
              appState: 'active',
              userId: this.currentDriverId,
            });
          
          this.lastHistorySaveTime = Date.now();
          this.lastHistorySaveLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          
          console.log('[LocationService] History point saved');
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
    } catch (error) {
      console.error('[LocationService] Heartbeat error:', error);
      // لا نرمي الخطأ — heartbeat اختياري
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

