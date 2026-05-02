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
  totalCrushes: 0,
  pendingRoll: null,
  profileId: null,
  avatarKey: 'default',
  unlockedAvatars: [],
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
      state.totalCrushes = backup.totalCrushes ?? state.totalCrushes
      state.avatarKey = backup.avatarKey ?? state.avatarKey
      state.unlockedAvatars = backup.unlockedAvatars ?? state.unlockedAvatars
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
      totalCrushes: state.totalCrushes,
      avatarKey: state.avatarKey,
      unlockedAvatars: state.unlockedAvatars,
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

function showGoldPopup(amount) {
  const el = document.getElementById('gold-popup')
  if (!el) return
  el.textContent = `+${amount} 💰`
  el.classList.remove('pop')
  void el.offsetWidth
  el.classList.add('pop')
  el.addEventListener('animationend', () => el.classList.remove('pop'), { once: true })
}

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
  updateAvatar()
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
  showGoldPopup,
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
modalCrushButton.addEventListener('click', () => {
  if (currentModalIdx === null) return
  const creature = state.collection[currentModalIdx]
  const others = state.collection.filter((_, idx) => idx !== currentModalIdx)
  document.getElementById('creature-modal').classList.remove('open')
  openCrushTargetModal(creature, currentModalIdx, others)
})

// ── CRUSH TARGET PICKER ──────────────────────────────────
let crushSourceIdx = null
let crushTargetIdx = null

function openCrushTargetModal(creature, sourceIdx, others) {
  crushSourceIdx = sourceIdx
  crushTargetIdx = null

  document.getElementById('crush-source-name').textContent = creature.nickname || creature.name
  document.getElementById('crush-target-confirm').disabled = true

  const xpGain = RARITY_XP[creature.rarity] || 10
  const goldGain = Math.round(xpGain * 0.5)
  const grid = document.getElementById('crush-target-grid')

  if (!others.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;color:var(--muted);font-style:italic;padding:20px 0;">
      No other creatures — you'll receive ${goldGain} 💰 instead.
    </div>`
    document.getElementById('crush-target-gold').textContent = `Take ${goldGain} 💰 Gold`
  } else {
    grid.innerHTML = others.map((c, i) => {
      const xpPct = Math.min(100, Math.round((c.xp / (c.evolves_at_xp || 100)) * 100))
      return `
        <div class="crush-target-card rarity-${c.rarity}" data-other-idx="${i}">
          <div class="crush-target-sprite">${c.sprite || '?'}</div>
          <div class="crush-target-name">${c.nickname || c.name}</div>
          <div class="crush-target-xp">+${xpGain} XP · Lv ${c.level}</div>
          <div style="width:100%;height:3px;background:var(--surface);border-radius:999px;overflow:hidden;margin-top:2px;">
            <div style="height:100%;width:${xpPct}%;background:var(--accent);border-radius:999px;"></div>
          </div>
        </div>`
    }).join('')

    grid.querySelectorAll('.crush-target-card').forEach(card => {
      card.addEventListener('click', () => {
        grid.querySelectorAll('.crush-target-card').forEach(c => c.classList.remove('selected'))
        card.classList.add('selected')
        crushTargetIdx = parseInt(card.dataset.otherIdx)
        document.getElementById('crush-target-confirm').disabled = false
      })
    })

    document.getElementById('crush-target-gold').textContent = `Take ${goldGain} 💰 Gold Instead`
  }

  document.getElementById('crush-target-modal').classList.add('open')
}

document.getElementById('crush-target-close').addEventListener('click', () => {
  document.getElementById('crush-target-modal').classList.remove('open')
})

document.getElementById('crush-target-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('crush-target-modal'))
    document.getElementById('crush-target-modal').classList.remove('open')
})

document.getElementById('crush-target-confirm').addEventListener('click', async () => {
  if (crushSourceIdx === null || crushTargetIdx === null) return
  const creature = state.collection[crushSourceIdx]
  const xpGain = RARITY_XP[creature.rarity] || 10
  const crushedId = creature._id

  const others = state.collection.filter((_, idx) => idx !== crushSourceIdx)
  const target = others[crushTargetIdx]
  const targetId = target._id

  target.xp = (target.xp || 0) + xpGain
  checkEvolution(target)
  await persistCreatureXP(target)

  state.totalCrushes = (state.totalCrushes || 0) + 1
  state.collection.splice(crushSourceIdx, 1)
  await persistCrush(crushedId, targetId, xpGain)

  const newTargetIdx = state.collection.indexOf(target)
  document.getElementById('crush-target-modal').classList.remove('open')
  updateUI()
  saveState()

  if (newTargetIdx !== -1) {
    const targetCard = document.querySelector(`#collection-grid .creature-card[data-idx="${newTargetIdx}"]`)
    if (targetCard) {
      const popup = document.createElement('div')
      popup.className = 'xp-popup'
      popup.textContent = `+${xpGain} XP`
      targetCard.appendChild(popup)
      popup.addEventListener('animationend', () => popup.remove())
    }
  }

  crushSourceIdx = null
  crushTargetIdx = null
})

document.getElementById('crush-target-gold').addEventListener('click', async () => {
  if (crushSourceIdx === null) return
  const creature = state.collection[crushSourceIdx]
  const xpGain = RARITY_XP[creature.rarity] || 10
  const goldGain = Math.round(xpGain * 0.5)
  const crushedId = creature._id

  state.currency += goldGain
  state.totalCrushes = (state.totalCrushes || 0) + 1
  state.collection.splice(crushSourceIdx, 1)
  await persistCrush(crushedId, null, 0)
  await persistProfile()

  document.getElementById('crush-target-modal').classList.remove('open')
  showGoldPopup(goldGain)
  updateUI()
  saveState()
  crushSourceIdx = null
  crushTargetIdx = null
})

// ══════════════════════════════════════════════════════════
// AVATAR SYSTEM
// ══════════════════════════════════════════════════════════

// Master avatar catalogue
// Each entry: { icon, label, category, unlockDesc, unlockCheck?, shopCost? }
// unlockCheck(state) → true = available to select
// shopCost present → must be purchased with gems first

const AVATAR_CATALOGUE = {
  // ── Default / always unlocked ──────────────────────────
  default:        { icon:'🧑', label:'Adventurer',      category:'standard', unlockCheck: () => true },
  wizard:         { icon:'🧙', label:'Wizard',          category:'standard', unlockCheck: () => true },
  knight:         { icon:'🛡️', label:'Knight',         category:'standard', unlockCheck: () => true },
  rogue:          { icon:'🗡️', label:'Rogue',          category:'standard', unlockCheck: () => true },

  // ── Achievement unlocks ────────────────────────────────
  first_roller:   { icon:'🥚', label:'First Summon',    category:'achievement', unlockDesc:'Roll your first creature',       unlockCheck: s => s.totalRolls >= 1 },
  first_blood:    { icon:'⚔️', label:'First Blood',    category:'achievement', unlockDesc:'Win your first battle',           unlockCheck: s => s.wins >= 1 },
  legend_hunter:  { icon:'🌟', label:'Legend Hunter',   category:'achievement', unlockDesc:'Own a Legendary creature',        unlockCheck: s => s.collection.some(c => c.rarity === 'legendary') },
  arena_veteran:  { icon:'🏆', label:'Arena Veteran',   category:'achievement', unlockDesc:'Win 10 battles',                  unlockCheck: s => s.wins >= 10 },
  collector:      { icon:'📚', label:'Collector',       category:'achievement', unlockDesc:'Collect 10 creatures',            unlockCheck: s => s.collection.length >= 10 },
  crusher:        { icon:'💥', label:'Crusher',         category:'achievement', unlockDesc:'Crush 5 creatures (any)',         unlockCheck: s => (s.totalCrushes || 0) >= 5 },

  // ── Battle badge unlocks ───────────────────────────────
  badge_5:        { icon:'🎖️', label:'5 Wins',         category:'badge', unlockDesc:'Win 5 battles',                      unlockCheck: s => s.wins >= 5 },
  badge_25:       { icon:'🥈', label:'25 Wins',         category:'badge', unlockDesc:'Win 25 battles',                     unlockCheck: s => s.wins >= 25 },
  badge_50:       { icon:'🥇', label:'50 Wins',         category:'badge', unlockDesc:'Win 50 battles',                     unlockCheck: s => s.wins >= 50 },
  badge_shadow:   { icon:'🌑', label:'Shadow Slayer',   category:'badge', unlockDesc:'Defeat a Shadow-type creature',       unlockCheck: s => (s.shadowDefeats || 0) >= 1 },
  badge_legend:   { icon:'💫', label:'Legend Slayer',   category:'badge', unlockDesc:'Defeat a Legendary-type creature',    unlockCheck: s => (s.legendDefeats || 0) >= 1 },

  // ── Creature captures ─────────────────────────────────
  // Unlocked dynamically when you own that creature name
  cap_emberwing:  { icon:'🦅', label:'Emberwing',       category:'creature', unlockDesc:"Capture Emberwing",               unlockCheck: s => s.collection.some(c => c.name === 'Emberwing') },
  cap_gloomfang:  { icon:'🐺', label:'Gloomfang',       category:'creature', unlockDesc:"Capture Gloomfang",               unlockCheck: s => s.collection.some(c => c.name === 'Gloomfang') },
  cap_duskwyrm:   { icon:'🐉', label:'Duskwyrm',        category:'creature', unlockDesc:"Capture Duskwyrm",                unlockCheck: s => s.collection.some(c => c.name === 'Duskwyrm') },
  cap_tideclaw:   { icon:'🦞', label:'Tideclaw',        category:'creature', unlockDesc:"Capture Tideclaw",                unlockCheck: s => s.collection.some(c => c.name === 'Tideclaw') },
  cap_crystalix:  { icon:'🦊', label:'Crystalix',       category:'creature', unlockDesc:"Capture Crystalix",               unlockCheck: s => s.collection.some(c => c.name === 'Crystalix') },
  cap_solarius:   { icon:'🦁', label:'Solarius',        category:'creature', unlockDesc:"Capture Solarius",                unlockCheck: s => s.collection.some(c => c.name === 'Solarius') },

  // ── Shop / premium ────────────────────────────────────
  elder_dragon:   { icon:'🐉', label:'Elder Dragon',    category:'shop', unlockDesc:'Purchase in the shop',   shopCost: 80 },
  champion_crown: { icon:'👑', label:'Champion Crown',  category:'shop', unlockDesc:'Purchase in the shop',   shopCost: 120 },
  void_wraith:    { icon:'💀', label:'Void Wraith',     category:'shop', unlockDesc:'Purchase in the shop',   shopCost: 200 },
  moon_sage:      { icon:'🌙', label:'Moon Sage',       category:'shop', unlockDesc:'Purchase in the shop',   shopCost: 60 },
}

const AVATAR_CATEGORY_LABELS = {
  standard:    'Standard',
  achievement: 'Achievements',
  badge:       'Battle Badges',
  creature:    'Captured Creatures',
  shop:        'Shop Exclusives',
}

// Selected key inside the picker (before confirming)
let pendingAvatarKey = null

function isAvatarUnlocked(key, av) {
  if (av.category === 'shop') return state.unlockedAvatars.includes(key)
  if (av.unlockCheck) return av.unlockCheck(state)
  return false
}

function updateAvatar() {
  const el = document.getElementById('profile-avatar')
  if (!el) return
  const av = AVATAR_CATALOGUE[state.avatarKey]
  el.textContent = av ? av.icon : '🧑'
}

function openAvatarPicker() {
  pendingAvatarKey = state.avatarKey
  document.getElementById('avatar-confirm-btn').disabled = false

  const container = document.getElementById('avatar-picker-content')

  // Group keys by category
  const grouped = {}
  for (const [key, av] of Object.entries(AVATAR_CATALOGUE)) {
    if (!grouped[av.category]) grouped[av.category] = []
    grouped[av.category].push([key, av])
  }

  const categoryOrder = ['standard', 'achievement', 'badge', 'creature', 'shop']
  let html = ''

  for (const cat of categoryOrder) {
    const items = grouped[cat] || []
    if (!items.length) continue

    html += `<div class="avatar-section-label">${AVATAR_CATEGORY_LABELS[cat]}</div>`
    html += `<div class="avatar-grid">`

    for (const [key, av] of items) {
      const unlocked = isAvatarUnlocked(key, av)
      const isSelected = key === pendingAvatarKey
      const isShopOwned = av.category === 'shop' && state.unlockedAvatars.includes(key)

      let classes = 'avatar-option'
      if (isSelected) classes += ' selected'
      if (!unlocked) classes += ' locked'

      const lockBadge = !unlocked ? `<span class="lock-icon">🔒</span>` : ''
      const ownedBadge = isShopOwned ? `<span class="owned-badge">✓</span>` : ''
      const tooltip = !unlocked && av.unlockDesc ? `title="${av.unlockDesc}"` : ''
      const clickHandler = unlocked ? `onclick="selectAvatar('${key}')"` : ''

      html += `
        <div class="${classes}" ${clickHandler} ${tooltip} data-key="${key}">
          ${lockBadge}${ownedBadge}
          <div class="avatar-option-icon">${av.icon}</div>
          <div class="avatar-option-label">${av.label}</div>
        </div>`
    }

    html += `</div>`
  }

  container.innerHTML = html
  document.getElementById('avatar-modal').classList.add('open')
}

window.selectAvatar = function(key) {
  pendingAvatarKey = key
  document.querySelectorAll('.avatar-option').forEach(el => {
    el.classList.toggle('selected', el.dataset.key === key)
  })
  document.getElementById('avatar-confirm-btn').disabled = false
}

// Confirm button
document.getElementById('avatar-confirm-btn').addEventListener('click', () => {
  if (!pendingAvatarKey) return
  state.avatarKey = pendingAvatarKey
  updateAvatar()
  document.getElementById('avatar-modal').classList.remove('open')
  saveState()
  showToast('Profile pic updated!')
})

// Open picker on avatar wrap click
document.getElementById('avatar-wrap').addEventListener('click', openAvatarPicker)

// Close modal
document.getElementById('avatar-modal-close').addEventListener('click', () => {
  document.getElementById('avatar-modal').classList.remove('open')
})
document.getElementById('avatar-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('avatar-modal'))
    document.getElementById('avatar-modal').classList.remove('open')
})

// Shop purchase handler (called from onclick in HTML)
window.shopBuyAvatar = function(key, cost) {
  const av = AVATAR_CATALOGUE[key]
  if (!av) return
  if (state.unlockedAvatars.includes(key)) {
    showToast('You already own this!')
    return
  }
  if (state.premium < cost) {
    showToast(`Not enough gems! Need 💎 ${cost}`)
    return
  }
  state.premium -= cost
  state.unlockedAvatars.push(key)
  persistProfile()
  saveState()
  updateUI()
  showToast(`${av.icon} ${av.label} unlocked! Set it in your Profile.`)
}

const logoutButton = document.getElementById('logout-btn')
logoutButton.addEventListener('click', async () => {
  await signOut()
})

if (user) {
  state.username = user.user_metadata?.username || user.email?.split('@')[0] || 'Adventurer'
}

bootstrap()