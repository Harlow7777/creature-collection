import { statBox } from './collection.js'

const RARITY_WEIGHTS = { common: 60, uncommon: 25, rare: 12, legendary: 3 }
const RARITY_XP = { common: 10, uncommon: 25, rare: 60, legendary: 200 }

export function initializeRollPage({ state, updateUI, persistProfile, persistKeptCreature, showToast, showGoldPopup, saveState, getCreatureTemplates, rarityColor }) {
  document.getElementById('roll-portal').addEventListener('click', doRoll)

  document.getElementById('btn-keep').addEventListener('click', async () => {
    if (!state.pendingRoll) return
    const btn = document.getElementById('btn-keep')
    btn.disabled = true
    btn.textContent = 'Saving...'

    const newEntry = { ...state.pendingRoll }
    const rowId = await persistKeptCreature(newEntry)
    newEntry._id = rowId

    if (!rowId) return

    state.collection.push(newEntry)
    state.pendingRoll = null
    document.getElementById('roll-result').classList.remove('visible')
    document.getElementById('roll-orb').textContent = '🌀'
    btn.disabled = false
    btn.textContent = 'Keep'
    showToast('Creature added to your collection!')
    updateUI()
    saveState()
  })

  document.getElementById('btn-crush-now').addEventListener('click', async () => {
    if (!state.pendingRoll) return
    const xpGain = RARITY_XP[state.pendingRoll.rarity]
    const goldGain = Math.round(xpGain * 0.5)
    state.currency += goldGain
    state.totalCrushes = (state.totalCrushes || 0) + 1
    state.pendingRoll = null
    document.getElementById('roll-result').classList.remove('visible')
    document.getElementById('roll-orb').textContent = '🌀'
    showGoldPopup(goldGain)
    await persistProfile()
    updateUI()
    saveState()
  })

  async function doRoll() {
    if (state.rollsToday <= 0) {
      showToast('No rolls remaining today!')
      return
    }
    if (state.pendingRoll) {
      showToast('Claim or crush your current roll first!')
      return
    }

    state.rollsToday--
    state.totalRolls++

    const rarity = weightedRoll()
    const pool = getCreatureTemplates().filter(c => c.rarity === rarity)
    const template = pool[Math.floor(Math.random() * pool.length)]

    const portal = document.getElementById('roll-portal')
    const orb = document.getElementById('roll-orb')

    portal.classList.add('spinning')
    orb.textContent = '✨'

    setTimeout(async () => {
      portal.classList.remove('spinning')
      orb.textContent = template.sprite

      state.pendingRoll = {
        ...template,
        level: 1,
        xp: 0,
        showcased: false,
        showcaseSlot: null,
        rolledAt: Date.now(),
      }

      showRollResult(state.pendingRoll)
      updateUI()
      await persistProfile()
      saveState()
    }, 650)
  }

  function weightedRoll() {
    const total = Object.values(RARITY_WEIGHTS).reduce((a, b) => a + b, 0)
    let rand = Math.random() * total
    for (const [rarity, weight] of Object.entries(RARITY_WEIGHTS)) {
      rand -= weight
      if (rand <= 0) return rarity
    }
    return 'common'
  }

  function showRollResult(creature) {
    document.getElementById('result-sprite').textContent = creature.sprite
    document.getElementById('result-name').textContent = creature.name
    const rarityElement = document.getElementById('result-rarity')
    rarityElement.textContent = creature.rarity.toUpperCase()
    rarityElement.style.color = rarityColor(creature.rarity)

    document.getElementById('result-stats').innerHTML =
      statBox('HP', creature.base_hp) +
      statBox('ATK', creature.base_atk) +
      statBox('DEF', creature.base_def) +
      statBox('SPD', creature.base_spd)

    document.getElementById('roll-result').classList.add('visible')
  }
}
