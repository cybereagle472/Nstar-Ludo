import { firebaseConfig } from './firebase-config.js';

export const authConfigured = Boolean(firebaseConfig.apiKey && firebaseConfig.authDomain && firebaseConfig.projectId && firebaseConfig.appId);
let ready;
async function firebase() {
  if (!authConfigured) throw new Error('Account sign-in needs a Firebase project. See README.md for setup.');
  if (!ready) ready = Promise.all([
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js'),
    import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js'),
  ]).then(([app, api]) => ({ api, auth: api.getAuth(app.initializeApp(firebaseConfig)) })).catch(error => {
    ready = null;
    throw new Error(`Could not load Firebase sign-in: ${error.message}`);
  });
  return ready;
}
export async function observeAuth(callback) {
  if (!authConfigured) return callback(null);
  const {api,auth} = await firebase();
  return api.onAuthStateChanged(auth, callback);
}
export async function logIn(email, password) {
  const {api,auth} = await firebase();
  return api.signInWithEmailAndPassword(auth, email, password);
}
export async function signUp(name, email, password) {
  const {api,auth} = await firebase();
  const credential = await api.createUserWithEmailAndPassword(auth, email, password);
  await api.updateProfile(credential.user, { displayName:name });
  return credential;
}
export async function googleLogin() {
  const {api,auth} = await firebase();
  return api.signInWithPopup(auth, new api.GoogleAuthProvider());
}
export async function resetPassword(email) {
  const {api,auth} = await firebase();
  return api.sendPasswordResetEmail(auth, email);
}
export async function changePassword(password) {
  const {api,auth} = await firebase();
  if (!auth.currentUser) throw new Error('Sign in before changing your password.');
  return api.updatePassword(auth.currentUser, password);
}
export async function updateName(name) {
  const {api,auth} = await firebase();
  if (auth.currentUser) await api.updateProfile(auth.currentUser, { displayName:name });
}
export async function signOut() {
  const {api,auth} = await firebase();
  return api.signOut(auth);
}
