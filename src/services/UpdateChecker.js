import firestore from '@react-native-firebase/firestore';
import { Alert, Linking } from 'react-native';
import DeviceInfo from 'react-native-device-info';

class UpdateChecker {
  /**
   * Check for app updates with admin-controlled rollout (v2.6.0)
   *
   * Firestore document: appConfig/version
   *   {
   *     version: "2.6.0",
   *     downloadUrl: "https://github.com/.../releases/download/.../app.apk",
   *     updateMessage: "إصلاحات وتحسينات",
   *     forceUpdate: false,
   *     targetDrivers: "all" | "none" | ["DRV030", "DRV004"]
   *   }
   *
   * @param {string} driverId - معرف السائق الحالي (للفحص ضد targetDrivers)
   * @returns {Promise<boolean>} true if update is available and shown
   */
  static async checkForUpdates(driverId = null) {
    try {
      console.log('[UpdateChecker] Checking for updates... driverId:', driverId);

      const currentVersion = DeviceInfo.getVersion();
      console.log('[UpdateChecker] Current version:', currentVersion);

      const versionDoc = await firestore()
        .collection('appConfig')
        .doc('version')
        .get();

      if (!versionDoc.exists) {
        console.log('[UpdateChecker] No version info found in Firestore');
        return false;
      }

      const versionData = versionDoc.data();
      const latestVersion = versionData.version;
      const forceUpdate = versionData.forceUpdate || false;
      const updateMessage = versionData.updateMessage || 'يوجد تحديث جديد';
      const downloadUrl = versionData.downloadUrl;
      const targetDrivers = versionData.targetDrivers || 'all';

      console.log('[UpdateChecker] Latest version:', latestVersion);
      console.log('[UpdateChecker] Force update:', forceUpdate);
      console.log('[UpdateChecker] Target drivers:', targetDrivers);

      // ===== V4 (v2.6.0): فلترة targetDrivers =====
      // 'none'  → التحديث مخفي تماماً
      // 'all'   → كل السائقين يشوفون التحديث
      // [...]   → فقط السائقين المحددين (للتجربة)
      if (targetDrivers === 'none') {
        console.log('[UpdateChecker] Update hidden by admin (targetDrivers=none)');
        return false;
      }

      if (Array.isArray(targetDrivers)) {
        if (!driverId) {
          console.log('[UpdateChecker] Specific drivers list set but driverId unknown - skipping');
          return false;
        }
        const normalized = String(driverId).toUpperCase().trim();
        const allowed = targetDrivers.map(d => String(d).toUpperCase().trim());
        if (!allowed.includes(normalized)) {
          console.log(`[UpdateChecker] Driver ${normalized} not in test group [${allowed.join(',')}] - skipping`);
          return false;
        }
        console.log(`[UpdateChecker] ✅ Driver ${normalized} is in test group`);
      }

      // مقارنة الإصدارات
      if (this.isNewerVersion(latestVersion, currentVersion)) {
        console.log('[UpdateChecker] Update available!');
        this.showUpdateDialog(
          currentVersion,
          latestVersion,
          updateMessage,
          downloadUrl,
          forceUpdate
        );
        return true;
      } else {
        console.log('[UpdateChecker] App is up to date');
        return false;
      }
    } catch (error) {
      console.error('[UpdateChecker] Error checking for updates:', error);
      return false;
    }
  }

  /**
   * Compare two version strings (e.g., "2.6.0" vs "2.5.11")
   * @returns {boolean} true if version1 is newer
   */
  static isNewerVersion(version1, version2) {
    if (!version1 || !version2) return false;
    const v1Parts = String(version1).split('.').map(Number);
    const v2Parts = String(version2).split('.').map(Number);

    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;

      if (v1Part > v2Part) return true;
      if (v1Part < v2Part) return false;
    }

    return false;
  }

  /**
   * عرض رسالة التحديث للسائق
   */
  static showUpdateDialog(currentVersion, latestVersion, message, downloadUrl, forceUpdate) {
    const title = forceUpdate ? '⚠️ تحديث مطلوب' : '📢 يوجد تحديث جديد';
    const fullMessage = `${message}\n\nالنسخة الحالية: ${currentVersion}\nالنسخة الجديدة: ${latestVersion}`;

    if (forceUpdate) {
      Alert.alert(
        title,
        fullMessage,
        [
          {
            text: 'تحديث الآن',
            onPress: () => this.downloadUpdate(downloadUrl),
          },
        ],
        { cancelable: false }
      );
    } else {
      Alert.alert(
        title,
        fullMessage,
        [
          {
            text: 'لاحقاً',
            style: 'cancel',
          },
          {
            text: 'تحديث الآن',
            onPress: () => this.downloadUpdate(downloadUrl),
          },
        ]
      );
    }
  }

  /**
   * فتح رابط تحميل APK
   */
  static downloadUpdate(downloadUrl) {
    if (!downloadUrl) {
      Alert.alert('خطأ', 'رابط التحميل غير متوفر');
      return;
    }

    console.log('[UpdateChecker] Opening download URL:', downloadUrl);
    Linking.openURL(downloadUrl).catch(err => {
      console.error('[UpdateChecker] Error opening download URL:', err);
      Alert.alert('خطأ', 'تعذر فتح رابط التحميل');
    });
  }
}

export default UpdateChecker;
