import { supabase } from '../supabase.js'

// Fetch user's creature collection
export async function getUserCreatures(userId) {
  const { data, error } = await supabase
    .from('user_creatures')
    .select(`
      *,
      creatures (
        name, type, rarity, sprite_url,
        base_hp, base_atk, base_def, base_spd
      )
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data
}

// Fetch top 3 displayed creatures
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

// Save a newly rolled creature to user
export async function saveRolledCreature(userId, creature) {
  const { data, error } = await supabase
    .from('user_creatures')
    .insert({
      user_id: userId,
      creature_id: creature.id,
      hp: creature.base_hp,
      atk: creature.base_atk,
      def: creature.base_def,
      spd: creature.base_spd
    })
    .select()

  if (error) throw error
  return data[0]
}

// Update showcase slots
export async function updateShowcase(userId, slots) {
  // slots = [{ id: userCreatureId, display_order: 1 }, ...]

  // Clear existing showcase
  await supabase
    .from('user_creatures')
    .update({ is_displayed: false, display_order: null })
    .eq('user_id', userId)

  // Set new slots
  for (const slot of slots) {
    await supabase
      .from('user_creatures')
      .update({ is_displayed: true, display_order: slot.display_order })
      .eq('id', slot.id)
  }
}