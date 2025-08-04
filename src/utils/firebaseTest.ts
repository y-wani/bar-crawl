// src/utils/firebaseTest.ts

import { collection, addDoc, getDocs } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Simple test to verify Firebase connection
 */
export const testFirebaseConnection = async () => {
  try {
    console.log('🧪 Testing Firebase connection...');
    
    // Test 1: Try to read from a collection (this should work even with strict rules)
    console.log('📖 Testing read access...');
    const testCollection = collection(db, 'test');
    const snapshot = await getDocs(testCollection);
    console.log('✅ Read test passed. Collection exists, docs:', snapshot.size);
    
    // Test 2: Try to write a simple document
    console.log('✍️ Testing write access...');
    const testDoc = {
      test: true,
      timestamp: new Date(),
      message: 'Firebase connection test'
    };
    
    const docRef = await addDoc(testCollection, testDoc);
    console.log('✅ Write test passed. Doc ID:', docRef.id);
    
    return {
      success: true,
      message: 'Firebase connection is working!'
    };
    
  } catch (error: any) {
    console.error('❌ Firebase test failed:', error);
    
    // Analyze the error
    let errorMessage = 'Unknown Firebase error';
    
    if (error.code === 'permission-denied') {
      errorMessage = 'Permission denied - check Firestore security rules';
    } else if (error.code === 'unauthenticated') {
      errorMessage = 'User not authenticated - please sign in first';
    } else if (error.code === 'unavailable') {
      errorMessage = 'Firestore service unavailable - check internet connection';
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return {
      success: false,
      error: errorMessage,
      code: error.code || 'unknown'
    };
  }
};