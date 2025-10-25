// اختبار طرق مختلفة لاستيراد واستخدام FieldValue

// الطريقة 1: الحالية
import firestore from '@react-native-firebase/firestore';
console.log('firestore:', typeof firestore);
console.log('firestore():', typeof firestore());
console.log('firestore().FieldValue:', firestore().FieldValue);

// الطريقة 2: استيراد FieldValue مباشرة
import { firebase } from '@react-native-firebase/firestore';
console.log('firebase:', firebase);
console.log('firebase.firestore:', firebase.firestore);
console.log('firebase.firestore.FieldValue:', firebase.firestore.FieldValue);

