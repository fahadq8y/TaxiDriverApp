import { Alert, Platform, PermissionsAndroid } from 'react-native';
import BackgroundGeolocation from 'react-native-background-geolocation';
import firestore from '@react-native-firebase/firestore';

class LocationService {
  constructor() {
    this.isConfigured = false;
    this.isTracking = false;
    this.currentDriverId = null;
    this.lastHistorySaveTime = null;
    this.lastHistorySaveLocation = null;
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
          'صلاحية الموقع مطلوبة',
          'التطبيق يحتاج صلاحية الوصول للموقع لتتبع رحلات السائق. الرجاء السماح من إعدادات التطبيق.',
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
              title: 'الموقع في الخلفية',
              message: 'للحفاظ على تتبع الرحلة حتى لو التطبيق مغلق، اختر "السماح طول الوقت"',
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
      Alert.alert('خطأ', 'حدث خطأ أثناء طلب الأذونات: ' + error.message);
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
      
      console.log('[LocationService] Calling BackgroundGeolocation.ready()...');
      const state = await BackgroundGeolocation.ready({
        // Geolocation Config
        desiredAccuracy: BackgroundGeolocation.DESIRED_ACCURACY_HIGH,
        // C3: distanceFilter:30 يقلل عدد الـ location events بنسبة ~95%
        // (من ~1/ثانية إلى مرة كل 30 متر تقريباً)
        // الـ heartbeat (أدناه) يضمن استمرار تحديث lastUpdate حتى لو السائق متوقف
        distanceFilter: 30,
        
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
          title: 'Allow location access',
          message: 'We need to track your location',
          positiveAction: 'Change to "{backgroundPermissionOptionLabel}"',
          negativeAction: 'Cancel',
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
      throw new Error(`فشل إعداد خدمة التتبع: ${error.message || 'خطأ غير معروف'}`);
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
        const errorMsg = 'صلاحية الموقع غير ممنوحة';
        console.error('[LocationService]', errorMsg);
        throw new Error(errorMsg);
      }
      
      // Configure if not already configured
      if (!this.isConfigured) {
        console.log('[LocationService] Not configured, configuring now...');
        await this.configure();
      }

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
      console.log('[LocationService] Creating/updating driver document...');
      try {
        await firestore()
          .collection('drivers')
          .doc(this.currentDriverId)
          .set({
            driverId: this.currentDriverId,
            isActive: true,
            lastUpdate: new Date(),
          }, { merge: true });
        console.log('[LocationService] Driver document created/updated successfully');
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
      throw new Error(`فشل بدء التتبع: ${error.message || 'خطأ غير معروف'}`);
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
      throw new Error(`فشل إيقاف التتبع: ${error.message || 'خطأ غير معروف'}`);
    }
  }

  // V3 PRO: حفظ ذكي - فقط نقاط ذات معنى
  // - السائق متوقف؟ ما نحفظ شيء (نقطة دخول واحدة عند التوقف فقط)
  // - السائق يتحرك؟ احفظ كل 50 متر أو دقيقة
  // - يقلل locationHistory من ~144 نقطة/12 ساعة توقف إلى نقطة وحدة فقط
  shouldSaveToHistory(location) {
    const now = Date.now();
    const currentLat = location.coords.latitude;
    const currentLng = location.coords.longitude;
    const currentSpeed = location.coords.speed ?? 0;
    const isMoving = location.is_moving === true || currentSpeed >= 0.83; // 3 km/h
    
    // أول نقطة دائماً تحفظ
    if (!this.lastHistorySaveTime || !this.lastHistorySaveLocation) {
      this.lastIsMoving = isMoving;
      return true;
    }
    
    const timeDiff = now - this.lastHistorySaveTime;
    const wasMoving = this.lastIsMoving === true;
    
    // 🚦 احفظ نقطة "تغير حالة" - من حركة لتوقف أو العكس
    if (wasMoving !== isMoving) {
      console.log(`[shouldSaveToHistory] State change: moving=${wasMoving}→${isMoving} - saving transition point`);
      this.lastIsMoving = isMoving;
      return true;
    }
    
    // 🛑 السائق متوقف: ما نحفظ شيء (heartbeat يحدث lastUpdate)
    if (!isMoving) {
      // فقط backup: لو مرّت ساعة كاملة بدون أي تحديث، احفظ نقطة "ما زال متوقف هنا"
      if (timeDiff >= 3600000) { // 1 hour
        console.log('[shouldSaveToHistory] Stopped > 1hr - backup point');
        return true;
      }
      return false;
    }
    
    // 🚗 السائق يتحرك: احفظ كل دقيقة أو 50 متر
    if (timeDiff >= 60000) {
      console.log('[shouldSaveToHistory] Moving - 1min elapsed');
      return true;
    }
    
    const distance = this.calculateDistance(
      this.lastHistorySaveLocation.latitude,
      this.lastHistorySaveLocation.longitude,
      currentLat,
      currentLng
    );
    if (distance >= 50) {
      console.log(`[shouldSaveToHistory] Moving - ${Math.round(distance)}m`);
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
      const isMoving = location.is_moving === true || speed >= 0.83;
      const activity = (location.activity && location.activity.type) || 'unknown';
      const activityConfidence = (location.activity && location.activity.confidence) || 0;
      
      console.log('[LocationService] Location received:', {
        speed: speed.toFixed(2),
        isMoving,
        activity,
        confidence: activityConfidence
      });
      
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
        throw new Error('صلاحية الموقع غير ممنوحة');
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
      throw new Error(`فشل الحصول على الموقع الحالي: ${error.message || 'خطأ غير معروف'}`);
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

