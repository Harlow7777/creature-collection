import { supabase } from './supabase.js'

// Sign up
export async function signUp(email, password, username) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username
      }
    }
  })

  if (error) throw error
  return data
}

// Sign in
export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  })
  if (error) throw error
  return data
}

// Sign out
export async function signOut() {
  await supabase.auth.signOut()
  window.location.href = '/index.html'
}

// Get current session
export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// Get current user
export async function getUser() {
  const { data } = await supabase.auth.getUser()
  return data.user
}

// Protect a page — call this at top of any protected page
export async function requireAuth() {
  const session = await getSession()
  if (!session) {
    window.location.href = '/index.html'
  }
  return session
}