# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Add any project specific keep options here:

# ===== GOOGLE PLAY SERVICES RULES =====
# Keep Google Play Services classes
-keep class com.google.android.gms.** { *; }
-dontwarn com.google.android.gms.**

# Keep Google Play Services Location classes
-keep class com.google.android.gms.location.** { *; }
-dontwarn com.google.android.gms.location.**

# Keep Activity Recognition classes
-keep class com.google.android.gms.location.ActivityRecognitionClient { *; }
-keep class com.google.android.gms.location.ActivityRecognition { *; }

# ===== TRANSISTOR BACKGROUND GEOLOCATION RULES =====
# Keep Transistor classes
-keep class com.transistorsoft.** { *; }
-dontwarn com.transistorsoft.**

# Keep Transistor location manager
-keep class com.transistorsoft.locationmanager.** { *; }
-dontwarn com.transistorsoft.locationmanager.**

# ===== REACT NATIVE RULES =====
# Keep React Native classes
-keep class com.facebook.react.** { *; }
-dontwarn com.facebook.react.**

# Keep native methods
-keepclasseswithmembernames class * {
    native <methods>;
}

# ===== GENERAL RULES =====
# Keep Parcelable implementations
-keepclassmembers class * implements android.os.Parcelable {
    static ** CREATOR;
}

# Keep Serializable implementations
-keepclassmembers class * implements java.io.Serializable {
    static final long serialVersionUID;
    private static final java.io.ObjectStreamField[] serialPersistentFields;
    private void writeObject(java.io.ObjectOutputStream);
    private void readObject(java.io.ObjectInputStream);
    java.lang.Object writeReplace();
    java.lang.Object readResolve();
}

