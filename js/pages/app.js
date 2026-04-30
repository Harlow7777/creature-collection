import { requireAuth, signOut, getUser } from '../auth.js'
import { supabase } from '../supabase.js'
import { renderCollection, renderShowcase, statBox } from './collection.js'
import { initializeRollPage } from './roll.js'
import { initializeBattlePage } from './battle.js'
import { initializeDevTools, renderDevToolsPage } from './devtools.js'
import { rarityColor } from '../utils/rarity.js'

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 12, legendary: 3 }
const RARITY_XP = { common: 10, uncommon: 25, rare: 60, legendary: 200 }

let CREATURE_TEMPLATES = []
let currentModalIdx = null

const state = {
  username: 'Adventurer',
  currency: 100,
  premium: 10,
  collection: [],
  showcase: [],
  rollsToday: 10,
  totalRolls: 0,
  wins: 0,
  pendingRoll: null,
  profileId: null,
}

const pageMeta = {
  collection: 'Your captured creatures',
  roll: 'Summon new creatures',
  battle: 'Challenge others',
  areas: 'Assign creatures to farm',
  shop: 'Spend your gold & gems',
  profile: 'Your account & stats',
  devtools: 'Test user profile and creature stat editor',
}

// ── AUTH GUARD ──
const session = await requireAuth()
const user = await getUser()

console.log('USER:', user)

function restoreStateBackup() {
  try {
    const backup = JSON.parse(localStorage.getItem('monstrum_state_backup') || 'null')
    if (backup && typeof backup === 'object') {
      state.username = backup.username || state.username
      state.currency = backup.currency ?? state.currency
      state.premium = backup.premium ?? state.premium
      state.rollsToday = backup.rollsToday ?? state.rollsToday
      state.totalRolls = backup.totalRolls ?? state.totalRolls
      state.wins = backup.wins ?? state.wins
      console.info('Loaded local state backup for profile values.')
    }
  } catch (err) {
    console.warn('Failed to restore local backup state:', err)
  }
}

async function bootstrap() {
  restoreStateBackup()
  showLoading(true)
  try {
    await loadCreatureTemplates()
    await loadProfile()
    await loadUserCollection()
  } catch (err) {
    console.error('Bootstrap error:', err)
  }
  showLoading(false)
  updateUI()
  // Refresh the battle fighter grid now that the collection is loaded
  if (window.refreshBattleSelectGrid) window.refreshBattleSelectGrid()
}

async function loadCreatureTemplates() {
  const { data, error } = await supabase
    .from('creatures')
    .select('*')
    .eq('evolution_stage', 1)
    .order('rarity')

  if (error) throw error
  CREATURE_TEMPLATES = (data || []).map(c => ({ ...c, sprite: c.sprite_url }))
}

async function loadProfile() {
  if (!user) return
  let profile = null
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle()

  if (error) {
    console.error('loadProfile error:', error);
    return;
  }

  profile = data
  if (!profile) {
    const { data: createdProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: user.id,
        username: user.email?.split('@')[0] || 'Adventurer',
        currency: 100,
        premium_currency: 10,
        rolls_today: 10,
        wins: 0,
        total_rolls: 0,
      })
      .single()

    if (createError) {
      console.error('createProfile error:', createError)
      return
    }

    profile = createdProfile
  }

  state.profileId = profile.id
  state.username = profile.username || user.email?.split('@')[0] || 'Adventurer'
  state.currency = profile.currency ?? state.currency
  state.premium = profile.premium_currency ?? state.premium
  state.rollsToday = profile.rolls_today ?? state.rollsToday
  state.wins = profile.wins ?? state.wins
  state.totalRolls = profile.total_rolls ?? state.totalRolls
}

async function loadUserCollection() {
  if (!user) return
  const { data, error } = await supabase
    .from('user_creatures')
    .select(`
      id, nickname, level, xp, hp, atk, def, spd,
      is_displayed, display_order,
      creatures ( id, name, type, rarity, sprite_url, base_hp, base_atk, base_def, base_spd, evolves_at_xp )
    `)
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  console.log('COLLECTION RAW:', data, error)
  if (error) {
    console.error('loadUserCollection error:', error)
    throw error
  }

  state.collection = (data || [])
    .filter(uc => uc.creatures)
    .map(uc => ({
    _id: uc.id,
    id: uc.creatures.id,
    name: uc.creatures.name,
    type: uc.creatures.type,
    rarity: uc.creatures.rarity,
    sprite: uc.creatures.sprite_url,
    base_hp: uc.hp ?? uc.creatures.base_hp,
    base_atk: uc.atk ?? uc.creatures.base_atk,
    base_def: uc.def ?? uc.creatures.base_def,
    base_spd: uc.spd ?? uc.creatures.base_spd,
    evolves_at_xp: uc.creatures.evolves_at_xp,
    nickname: uc.nickname,
    level: uc.level,
    xp: uc.xp,
    showcased: uc.is_displayed,
    showcaseSlot: uc.display_order,
  }))
}

async function persistKeptCreature(creature) {
  if (!user) return null
  const { data, error } = await supabase
    .from('user_creatures')
    .insert({
      user_id: user.id,
      creature_id: creature.id,
      level: 1,
      xp: 0,
      hp: creature.base_hp,
      atk: creature.base_atk,
      def: creature.base_def,
      spd: creature.base_spd,
    })
    .select('id')
    .single()

  if (error || !data) {
    console.error('Save creature error:', error)
    showToast('Failed to save creature!')
    return null
  }
  return data.id
}

async function persistCrush(userCreatureId, targetId, xpGain) {
  if (!user) return
  await supabase.from('user_creatures').delete().eq('id', userCreatureId)
  if (targetId) {
    const { data: t } = await supabase.from('user_creatures').select('xp').eq('id', targetId).single()
    if (t) {
      await supabase.from('user_creatures')
        .update({ xp: t.xp + xpGain })
        .eq('id', targetId)
    }
  }
}

async function persistShowcase() {
  if (!user) return
  await supabase
    .from('user_creatures')
    .update({ is_displayed: false, display_order: null })
    .eq('user_id', user.id)

  for (const creature of state.collection.filter(x => x.showcased)) {
    if (!creature._id) continue
    await supabase
      .from('user_creatures')
      .update({ is_displayed: true, display_order: creature.showcaseSlot })
      .eq('id', creature._id)
  }
}

async function persistProfile() {
  if (!user) return
  const { error } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      username: state.username,
      currency: state.currency,
      premium_currency: state.premium,
      rolls_today: state.rollsToday,
      wins: state.wins,
      total_rolls: state.totalRolls,
    }, { onConflict: 'id' })

  if (error) {
    console.error('persistProfile error:', error)
  }
}

async function persistCreatureXP(creature) {
  if (!user || !creature._id) return
  await supabase
    .from('user_creatures')
    .update({
      xp: creature.xp,
      level: creature.level,
      hp: creature.base_hp,
      atk: creature.base_atk,
      def: creature.base_def,
      spd: creature.base_spd,
    })
    .eq('id', creature._id)
}

function showLoading(on) {
  let el = document.getElementById('loading-overlay')
  if (!el) {
    el = document.createElement('div')
    el.id = 'loading-overlay'
    el.style.cssText = 'position:fixed;inset:0;background:rgba(10,10,15,0.8);z-index:200;display:flex;align-items:center;justify-content:center;font-family:"Cinzel Decorative",serif;font-size:1rem;color:#a07aff;letter-spacing:0.1em;'
    el.textContent = 'Loading your realm...'
    document.body.appendChild(el)
  }
  el.style.display = on ? 'flex' : 'none'
}

function saveState() {
  try {
    localStorage.setItem('monstrum_state_backup', JSON.stringify({
      username: state.username,
      currency: state.currency,
      premium: state.premium,
      rollsToday: state.rollsToday,
      totalRolls: state.totalRolls,
      wins: state.wins,
    }))
  } catch (e) {
    console.warn('Failed to save local backup state:', e)
  }
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast')
  t.textContent = msg
  t.classList.add('show')
  setTimeout(() => t.classList.remove('show'), duration)
}
window.showToast = showToast

function updateUI() {
  document.getElementById('nav-username').textContent = state.username
  document.getElementById('user-strip').addEventListener('click', () => {
    switchToPage('profile')
  })
  document.getElementById('nav-currency').textContent = state.currency
  document.getElementById('nav-premium').textContent = state.premium
  document.getElementById('profile-username').textContent = state.username
  document.getElementById('p-creatures').textContent = state.collection.length
  document.getElementById('p-wins').textContent = state.wins
  document.getElementById('p-rolls').textContent = state.totalRolls
  document.getElementById('p-gold').textContent = state.currency
  document.getElementById('p-gems').textContent = state.premium
  document.getElementById('rolls-remaining').textContent = state.rollsToday
  renderCollection(state.collection)
  renderShowcase(state.collection)
  if (document.getElementById('page-devtools')?.classList.contains('active')) {
    renderDevToolsPage(state)
  }
}

function openCreatureModal(index) {
  currentModalIdx = index
  const creature = state.collection[index]
  if (!creature) return

  document.getElementById('m-sprite').textContent = creature.sprite
  document.getElementById('m-name').textContent = creature.nickname || creature.name

  const xpNeeded = creature.evolves_at_xp || 100
  const xpPct = Math.min(100, Math.round((creature.xp / xpNeeded) * 100))

  document.getElementById('m-meta').innerHTML =
    `<span class="rarity-badge rarity-${creature.rarity}" style="background:rgba(160,122,255,0.1);color:${rarityColor(creature.rarity)};padding:3px 10px;border-radius:999px;font-size:0.75rem;text-transform:uppercase;">${creature.rarity}</span>
     <span style="font-size:0.82rem;color:var(--muted);">${creature.type} · Lv ${creature.level}</span>`

  document.getElementById('m-stats').innerHTML =
    statBox('HP', creature.base_hp) + statBox('ATK', creature.base_atk) + statBox('DEF', creature.base_def) + statBox('SPD', creature.base_spd)

  document.getElementById('m-xp-text').textContent = `${creature.xp} / ${xpNeeded}`
  document.getElementById('m-xp-fill').style.width = xpPct + '%'

  document.getElementById('m-pet-slot').innerHTML = creature.pet
    ? `<span style="font-size:1.2rem">${creature.pet.sprite}</span><span>${creature.pet.name} — ${creature.pet.bonus}</span>`
    : `<span style="font-size:1.2rem">🐾</span><span>Assign a pet companion</span>`

  document.getElementById('creature-modal').classList.add('open')
}
window.openCreatureModal = openCreatureModal

function checkEvolution(creature) {
  if (creature.xp >= (creature.evolves_at_xp || 100)) {
    creature.level++
    creature.xp = 0
    creature.base_hp = Math.round(creature.base_hp * 1.1)
    creature.base_atk = Math.round(creature.base_atk * 1.1)
    creature.base_def = Math.round(creature.base_def * 1.1)
    creature.base_spd = Math.round(creature.base_spd * 1.05)
    showToast(`✨ ${creature.name} leveled up to Lv ${creature.level}!`, 3500)
  }
}

initializeRollPage({
  state,
  updateUI,
  persistProfile,
  persistKeptCreature,
  showToast,
  saveState,
  getCreatureTemplates: () => CREATURE_TEMPLATES,
  rarityColor,
})

initializeBattlePage({
  state,
  updateUI,
  persistProfile,
  showToast,
  saveState,
  getCreatureTemplates: () => CREATURE_TEMPLATES,
})

initializeDevTools({
  state,
  updateUI,
  persistProfile,
  persistCreatureXP,
  showToast,
})

const navButtons = document.querySelectorAll('.nav-item')
navButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    switchToPage(btn.dataset.page)
  })
})

function switchToPage(page) {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === page)
  })

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'))
  document.getElementById('page-' + page).classList.add('active')

  document.getElementById('page-title').textContent =
    page.charAt(0).toUpperCase() + page.slice(1)

  document.getElementById('page-meta').textContent =
    pageMeta[page] || ''

  if (page === 'devtools') {
    renderDevToolsPage(state)
  }

  if (page === 'battle' && window.refreshBattleSelectGrid) {
    window.refreshBattleSelectGrid()
  }
}

const modalCloseButton = document.getElementById('modal-close')
modalCloseButton.addEventListener('click', () => {
  document.getElementById('creature-modal').classList.remove('open')
})

document.getElementById('creature-modal').addEventListener('click', (event) => {
  if (event.target === document.getElementById('creature-modal')) {
    document.getElementById('creature-modal').classList.remove('open')
  }
})

const showcaseButton = document.getElementById('m-btn-showcase')
showcaseButton.addEventListener('click', async () => {
  if (currentModalIdx === null) return
  const creature = state.collection[currentModalIdx]
  const usedSlots = state.collection.filter(x => x.showcased).map(x => x.showcaseSlot)
  const freeSlot = [1, 2, 3].find(slot => !usedSlots.includes(slot))

  if (creature.showcased) {
    creature.showcased = false
    creature.showcaseSlot = null
    showToast('Removed from showcase.')
  } else if (freeSlot) {
    creature.showcased = true
    creature.showcaseSlot = freeSlot
    showToast(`Pinned to showcase slot #${freeSlot}!`)
  } else {
    showToast('Showcase is full! Remove one first.')
  }

  document.getElementById('creature-modal').classList.remove('open')
  updateUI()
  await persistShowcase()
  saveState()
})

const modalCrushButton = document.getElementById('m-btn-crush')
modalCrushButton.addEventListener('click', async () => {
  if (currentModalIdx === null) return
  const creature = state.collection[currentModalIdx]
  const xpGain = RARITY_XP[creature.rarity] || 10
  const crushedId = creature._id

  let targetId = null
  const others = state.collection.filter((_, idx) => idx !== currentModalIdx)
  if (others.length > 0) {
    const target = others[Math.floor(Math.random() * others.length)]
    target.xp = (target.xp || 0) + xpGain
    targetId = target._id
    checkEvolution(target)
    await persistCreatureXP(target)
    showToast(`Crushed ${creature.name}! ${target.name} gained ${xpGain} XP.`)
  } else {
    state.currency += Math.round(xpGain * 0.5)
    await persistProfile()
    showToast(`Crushed ${creature.name} for gold!`)
  }

  state.collection.splice(currentModalIdx, 1)
  await persistCrush(crushedId, targetId, xpGain)
  document.getElementById('creature-modal').classList.remove('open')
  updateUI()
  saveState()
})

const logoutButton = document.getElementById('logout-btn')
logoutButton.addEventListener('click', async () => {
  await signOut()
})

if (user) {
  state.username = user.user_metadata?.username || user.email?.split('@')[0] || 'Adventurer'
}

bootstrap()