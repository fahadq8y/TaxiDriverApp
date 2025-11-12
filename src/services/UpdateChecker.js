import firestore from '@react-native-firebase/firestore';
import { Alert, Linking } from 'react-native';
import DeviceInfo from 'react-native-device-info';

class UpdateChecker {
  /**
   * Check for app updates
   * @returns {Promise<boolean>} true if update is available
   */
  static async checkForUpdates() {
    try {
      console.log('[UpdateChecker] Checking for updates...');
      
      // Get current app version
      const currentVersion = DeviceInfo.getVersion();
      console.log('[UpdateChecker] Current version:', currentVersion);
      
      // Get latest version from Firestore
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
      
      console.log('[UpdateChecker] Latest version:', latestVersion);
      console.log('[UpdateChecker] Force update:', forceUpdate);
      
      // Compare versions
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
   * Compare two version strings
   * @param {string} version1 - First version (e.g., "2.3.0")
   * @param {string} version2 - Second version (e.g., "2.2.0")
   * @returns {boolean} true if version1 is newer than version2
   */
  static isNewerVersion(version1, version2) {
    const v1Parts = version1.split('.').map(Number);
    const v2Parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1Parts.length, v2Parts.length); i++) {
      const v1Part = v1Parts[i] || 0;
      const v2Part = v2Parts[i] || 0;
      
      if (v1Part > v2Part) return true;
      if (v1Part < v2Part) return false;
    }
    
    return false;
  }
  
  /**
   * Show update dialog
   */
  static showUpdateDialog(currentVersion, latestVersion, message, downloadUrl, forceUpdate) {
    const title = forceUpdate ? '⚠️ تحديث مطلوب' : '📢 يوجد تحديث جديد';
    const fullMessage = `${message}\n\nالنسخة الحالية: ${currentVersion}\nالنسخة الجديدة: ${latestVersion}`;
    
    if (forceUpdate) {
      // Force update - no cancel button
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
      // Optional update - with cancel button
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
   * Download and install update
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
