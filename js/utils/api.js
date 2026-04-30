import { supabase } from '../supabase.js'

export async function getUserCreatures(userId) {
  const { data, error } = await supabase
    .from('user_creatures')
    .select('*, creatures(name, type, rarity, sprite_url, base_hp, base_atk, base_def, base_spd)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function getShowcase(userId) {
  const { data, error } = await supabase
    .from('user_creatures')
    .select('*, creatures(*)')
    .eq('user_id', userId)
    .eq('is_displayed', true)
    .order('display_order', { ascending: true })
  if (error) throw error
  return data
}

export async function saveRolledCreature(userId, creature) {
  const { data, error } = await supabase
    .from('user_creatures')
    .insert({
      user_id: userId,
      creature_id: creature.id,
      hp: creature.base_hp,
      atk: creature.base_atk,
      def: creature.base_def,
      spd: creature.base_spd,
    })
    .select()
  if (error) throw error
  return data[0]
}

export async function crushCreature(userCreatureId, targetId, xpGain) {
  // Delete crushed creature
  await supabase.from('user_creatures').delete().eq('id', userCreatureId)
  // Add XP to target
  const { data: target } = await supabase
    .from('user_creatures').select('xp').eq('id', targetId).single()
  if (target) {
    await supabase.from('user_creatures')
      .update({ xp: target.xp + xpGain })
      .eq('id', targetId)
  }
}

export async function updateShowcase(userId, slots) {
  await supabase
    .from('user_creatures')
    .update({ is_displayed: false, display_order: null })
    .eq('user_id', userId)
  for (const slot of slots) {
    await supabase
      .from('user_creatures')
      .update({ is_displayed: true, display_order: slot.display_order })
      .eq('id', slot.id)
  }
}

export async function getProfile(userId) {
  const { data, error } = await supabase
    .from('profiles').select('*').eq('id', userId).single()
  if (error) throw error
  return data
}

export async function updateCurrency(userId, amount) {
  const { data: profile } = await supabase
    .from('profiles').select('currency').eq('id', userId).single()
  if (profile) {
    await supabase
      .from('profiles')
      .update({ currency: profile.currency + amount })
      .eq('id', userId)
  }
}
