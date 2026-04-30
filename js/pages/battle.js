export function initializeBattlePage({ state, updateUI, persistProfile, showToast, saveState, getCreatureTemplates }) {
  const battleState = {
    yourFighter: null,
    oppFighter: null,
    inBattle: false,
    yourHp: 0,
    oppHp: 0,
  }

  document.getElementById('btn-choose-fighter').addEventListener('click', () => {
    if (state.collection.length === 0) {
      showToast('You have no creatures! Roll some first.')
      return
    }

    const creature = state.collection[Math.floor(Math.random() * state.collection.length)]
    battleState.yourFighter = creature
    battleState.yourHp = creature.base_hp

    const fighter = document.getElementById('fighter-you')
    fighter.querySelector('.fighter-sprite').textContent = creature.sprite
    fighter.querySelector('.fighter-name').textContent = creature.nickname || creature.name
    fighter.querySelector('.hp-text').textContent = `${battleState.yourHp} / ${creature.base_hp}`
    fighter.querySelector('.hp-bar').style.width = '100%'

    showToast(`${creature.name} is ready to fight!`)
  })

  document.getElementById('btn-find-opponent').addEventListener('click', () => {
    const templates = getCreatureTemplates()
    const template = templates[Math.floor(Math.random() * templates.length)]
    battleState.oppFighter = { ...template }
    battleState.oppHp = template.base_hp

    const fighter = document.getElementById('fighter-opp')
    fighter.querySelector('.fighter-sprite').textContent = template.sprite
    fighter.querySelector('.fighter-name').textContent = template.name
    fighter.querySelector('.hp-text').textContent = `${battleState.oppHp} / ${template.base_hp}`
    fighter.querySelector('.hp-bar').style.width = '100%'

    if (battleState.yourFighter) {
      document.getElementById('btn-attack').disabled = false
      battleState.inBattle = true
      addLog('A wild ' + template.name + ' appeared! Battle begins!', 'highlight')
    }
  })

  document.getElementById('btn-attack').addEventListener('click', async () => {
    if (!battleState.inBattle) return
    const you = battleState.yourFighter
    const opp = battleState.oppFighter

    const yourDmg = Math.max(1, Math.round(you.base_atk - opp.base_def * 0.4 + (Math.random() * 10 - 5)))
    battleState.oppHp = Math.max(0, battleState.oppHp - yourDmg)
    addLog(`${you.name} attacks for ${yourDmg} damage!`, 'damage')
    updateFighterHp('opp', battleState.oppHp, opp.base_hp)

    if (battleState.oppHp <= 0) {
      addLog(`${you.name} wins! Victory!`, 'win')
      state.wins++
      state.currency += 50
      battleState.inBattle = false
      document.getElementById('btn-attack').disabled = true
      await persistProfile()
      updateUI()
      saveState()
      return
    }

    setTimeout(() => {
      const oppDmg = Math.max(1, Math.round(opp.base_atk - you.base_def * 0.4 + (Math.random() * 10 - 5)))
      battleState.yourHp = Math.max(0, battleState.yourHp - oppDmg)
      addLog(`${opp.name} retaliates for ${oppDmg} damage!`, 'damage')
      updateFighterHp('you', battleState.yourHp, you.base_hp)

      if (battleState.yourHp <= 0) {
        addLog(`${you.name} was defeated...`, 'win')
        battleState.inBattle = false
        document.getElementById('btn-attack').disabled = true
      }
    }, 600)
  })

  function addLog(message, cls = 'log-line') {
    const log = document.getElementById('battle-log')
    const line = document.createElement('div')
    line.className = `log-line ${cls}`
    line.textContent = message
    log.appendChild(line)
    log.scrollTop = log.scrollHeight
  }

  function updateFighterHp(side, current, max) {
    const fighter = document.getElementById(`fighter-${side}`)
    const pct = Math.max(0, Math.round((current / max) * 100))
    fighter.querySelector('.hp-bar').style.width = `${pct}%`
    fighter.querySelector('.hp-text').textContent = `${current} / ${max}`
    if (pct < 30) {
      fighter.querySelector('.hp-bar').style.background = 'linear-gradient(90deg,#ff6060,#ff9060)'
    }
  }
}
