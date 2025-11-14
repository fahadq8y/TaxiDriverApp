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
        distanceFilter: 0,
        
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
        // Transistor SQLite database for offline storage
        autoSync: true,              // Auto-sync to server when online
        autoSyncThreshold: 1,        // Sync after 5 locations
        batchSync: false,             // Batch multiple locations
        maxBatchSize: 50,            // Max 50 locations per batch
        maxDaysToPersist: 7,         // Keep locations for 7 days
        maxRecordsToPersist: 10000,  // Max 10k records in SQLite
        
        // ===== ACTIVITY RECOGNITION (Battery Saving) =====
        stopTimeout: 15,              // Stop tracking after 5 minutes of no movement
        stopDetectionDelay: 1,       // Wait 1 minute before detecting stop
        disableStopDetection: false, // Enable stop detection
        
        // ===== MOTION DETECTION =====
        preventSuspend: true,        // Prevent app suspension
      });

      console.log('[LocationService] Configuration successful');
      console.log('[LocationService] BackgroundGeolocation state:', JSON.stringify(state));
      this.isConfigured = true;
      
      // Register location listener
      console.log('[LocationService] Registering location listeners...');
      BackgroundGeolocation.onLocation(this.onLocation.bind(this), this.onLocationError.bind(this));
      console.log('[LocationService] Location listeners registered');
      
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

  // Check if we should save this location to history
  shouldSaveToHistory(location) {
    const now = Date.now();
    const currentLat = location.coords.latitude;
    const currentLng = location.coords.longitude;
    // Handle null/undefined speed values safely
    const currentSpeed = location.coords.speed ?? 0; // m/s - use nullish coalescing
    
    // Save if it's the first location
    if (!this.lastHistorySaveTime || !this.lastHistorySaveLocation) {
      return true;
    }
    
    const timeDiff = now - this.lastHistorySaveTime;
    
    // Smart Stop Detection: إذا السائق متوقف (speed < 1 km/h = 0.28 m/s)
    if (currentSpeed < 0.28) {
      // احفظ كل 5 دقائق فقط (12 نقطة/ساعة)
      if (timeDiff >= 300000) { // 5 minutes
        console.log('[shouldSaveToHistory] Driver stopped - saving after 5 minutes');
        return true;
      }
    } else {
      // إذا السائق يتحرك
      // احفظ كل دقيقة (60 نقطة/ساعة)
      if (timeDiff >= 60000) { // 1 minute
        console.log('[shouldSaveToHistory] Driver moving - saving after 1 minute');
        return true;
      }
      
      // أو إذا تحرك 50 متر
      const lastLat = this.lastHistorySaveLocation.latitude;
      const lastLng = this.lastHistorySaveLocation.longitude;
      const distance = this.calculateDistance(lastLat, lastLng, currentLat, currentLng);
      if (distance >= 50) { // 50 meters
        console.log(`[shouldSaveToHistory] Driver moved ${Math.round(distance)}m - saving`);
        return true;
      }
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
      console.log('[LocationService] Location received:', location.coords);
      
      if (!this.currentDriverId) {
        console.warn('[LocationService] No driver ID set, skipping location save');
        return;
      }

      // Save to Firestore with set + merge to ensure document exists
      await firestore()
        .collection('drivers')
        .doc(this.currentDriverId)
        .set({
          location: {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            accuracy: location.coords.accuracy,
            speed: location.coords.speed || 0,
            heading: location.coords.heading || 0,
          },
          // Also save location directly in driver document (for easy access)
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          speed: location.coords.speed || 0,
          accuracy: location.coords.accuracy,
          heading: location.coords.heading || -1,
          lastUpdate: new Date(),
          isActive: true,
        }, { merge: true });

      console.log('[LocationService] Location saved to Firestore');
      
      // Save to locationHistory if conditions are met
      if (this.shouldSaveToHistory(location)) {
        try {
          // Calculate expiry date (2 months from now)
          const expiryDate = new Date();
          expiryDate.setMonth(expiryDate.getMonth() + 2);
          
          await firestore()
            .collection('locationHistory')
            .add({
              driverId: this.currentDriverId,
              latitude: location.coords.latitude,
              longitude: location.coords.longitude,
              accuracy: location.coords.accuracy || 0,
              speed: location.coords.speed || 0,
              heading: location.coords.heading || 0,
              timestamp: new Date(),
              expiryDate: expiryDate,
              appState: 'active',
              userId: this.currentDriverId,
            });
          
          // Update last save time and location
          this.lastHistorySaveTime = Date.now();
          this.lastHistorySaveLocation = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };
          
          console.log('[LocationService] Location saved to history');
        } catch (historyError) {
          console.error('[LocationService] Error saving to history:', historyError);
          // Don't throw - just log the error
        }
      }
    } catch (error) {
      console.error('[LocationService] Error saving location:', error);
      // Don't throw - just log the error
    }
  }

  onLocationError(error) {
    console.error('[LocationService] Location error:', error);
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

