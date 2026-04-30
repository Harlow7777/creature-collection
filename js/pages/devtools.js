export function initializeDevTools({ state, updateUI, persistProfile, persistCreatureXP, showToast }) {
  document.getElementById('dev-creature-select')?.addEventListener('change', () => updateDevCreatureInputs(state))
  document.getElementById('dev-save-profile')?.addEventListener('click', async () => {
    await saveDevProfileOverrides(state, persistProfile, updateUI, showToast)
  })
  document.getElementById('dev-reset-profile')?.addEventListener('click', () => {
    resetDevProfileInputs(state, showToast)
  })
  document.getElementById('dev-save-creature')?.addEventListener('click', async () => {
    await saveDevCreatureStats(state, persistCreatureXP, updateUI, showToast)
  })
}

export function renderDevToolsPage(state) {
  const select = document.getElementById('dev-creature-select')
  if (!select) return

  document.getElementById('dev-gold').value = state.currency
  document.getElementById('dev-gems').value = state.premium
  document.getElementById('dev-rolls').value = state.rollsToday
  document.getElementById('dev-wins').value = state.wins
  document.getElementById('dev-total-rolls').value = state.totalRolls

  select.innerHTML = state.collection.length
    ? state.collection.map((creature, i) => `<option value="${i}">${creature.nickname || creature.name} (Lv ${creature.level})</option>`).join('')
    : '<option value="">No creatures available</option>'

  if (state.collection.length > 0) {
    updateDevCreatureInputs(state)
  } else {
    document.getElementById('dev-creature-hp').value = ''
    document.getElementById('dev-creature-atk').value = ''
    document.getElementById('dev-creature-def').value = ''
    document.getElementById('dev-creature-spd').value = ''
  }
}

function updateDevCreatureInputs(state) {
  const select = document.getElementById('dev-creature-select')
  const idx = Number(select.value)
  const creature = state.collection[idx]

  if (!creature) {
    document.getElementById('dev-creature-hp').value = ''
    document.getElementById('dev-creature-atk').value = ''
    document.getElementById('dev-creature-def').value = ''
    document.getElementById('dev-creature-spd').value = ''
    return
  }

  document.getElementById('dev-creature-hp').value = creature.base_hp
  document.getElementById('dev-creature-atk').value = creature.base_atk
  document.getElementById('dev-creature-def').value = creature.base_def
  document.getElementById('dev-creature-spd').value = creature.base_spd
}

async function saveDevProfileOverrides(state, persistProfile, updateUI, showToast) {
  state.currency = Math.max(0, Number(document.getElementById('dev-gold').value) || 0)
  state.premium = Math.max(0, Number(document.getElementById('dev-gems').value) || 0)
  state.rollsToday = Math.max(0, Number(document.getElementById('dev-rolls').value) || 0)
  state.wins = Math.max(0, Number(document.getElementById('dev-wins').value) || 0)
  state.totalRolls = Math.max(0, Number(document.getElementById('dev-total-rolls').value) || 0)

  updateUI()
  await persistProfile()
  showToast('Dev profile values updated.')
}

function resetDevProfileInputs(state, showToast) {
  renderDevToolsPage(state)
  showToast('Dev tools reset to current values.')
}

async function saveDevCreatureStats(state, persistCreatureXP, updateUI, showToast) {
  const select = document.getElementById('dev-creature-select')
  const idx = Number(select.value)
  const creature = state.collection[idx]

  if (!creature) {
    showToast('Choose a creature to edit.')
    return
  }

  creature.base_hp = Math.max(1, Number(document.getElementById('dev-creature-hp').value) || 0)
  creature.base_atk = Math.max(0, Number(document.getElementById('dev-creature-atk').value) || 0)
  creature.base_def = Math.max(0, Number(document.getElementById('dev-creature-def').value) || 0)
  creature.base_spd = Math.max(0, Number(document.getElementById('dev-creature-spd').value) || 0)

  await persistCreatureXP(creature)
  updateUI()
  showToast('Creature stats updated.')
}
