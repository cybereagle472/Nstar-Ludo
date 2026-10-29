import { cloudConfigured, getClient } from './supabase.js';
import { supabaseConfig } from './supabase-config.js';

export const authConfigured = cloudConfigured;
export const googleConfigured = authConfigured && supabaseConfig.googleEnabled;
const normalize = user => user ? {id:user.id,email:user.email || '',displayName:user.user_metadata?.name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Player'} : null;
const checked = ({data,error}) => { if (error) throw error; return data; };
const redirectTo = () => new URL('./',location.href).href;

export async function observeAuth(callback) {
  if (!authConfigured) return callback(null,'INITIAL_SESSION');
  const sb = await getClient();
  const {data:{subscription}} = sb.auth.onAuthStateChange((event,session) => {
    // Supabase callbacks run while holding an auth lock; defer other API work.
    setTimeout(() => callback(normalize(session?.user),event),0);
  });
  return () => subscription.unsubscribe();
}
export async function logIn(email,password) {
  const sb = await getClient();
  const data = checked(await sb.auth.signInWithPassword({email,password}));
  return {user:normalize(data.user)};
}
export async function signUp(name,email,password) {
  const sb = await getClient();
  const data = checked(await sb.auth.signUp({email,password,options:{data:{name},emailRedirectTo:redirectTo()}}));
  return {user:normalize(data.user),requiresEmailConfirmation:!data.session};
}
export async function googleLogin() {
  if (!googleConfigured) throw new Error('Google sign-in needs to be configured in Supabase first.');
  const sb = await getClient();
  checked(await sb.auth.signInWithOAuth({provider:'google',options:{redirectTo:redirectTo()}}));
}
export async function resetPassword(email) {
  const sb = await getClient();
  checked(await sb.auth.resetPasswordForEmail(email,{redirectTo:redirectTo()}));
}
export async function changePassword(password) {
  const sb = await getClient(); checked(await sb.auth.updateUser({password}));
}
export async function updateName(name) {
  const sb = await getClient(); checked(await sb.auth.updateUser({data:{name}}));
}
export async function signOut() {
  const sb = await getClient(); const {error} = await sb.auth.signOut(); if (error) throw error;
}
