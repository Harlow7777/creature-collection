export function initializeBattlePage({ state, updateUI, persistProfile, showToast, saveState, getCreatureTemplates }) {

  const battleState = {
    yourFighter: null,
    oppFighter:  null,
    inBattle:    false,
    busy:        false,
    yourHp:      0,
    oppHp:       0,
  }

  // ── LAZY ELEMENT GETTER ───────────────────────────────────
  const el = id => document.getElementById(id)

  // ── FIGHTER SELECT PANEL ──────────────────────────────────
  function renderSelectGrid() {
    const grid = el('fighter-select-grid')
    if (!grid) return

    if (!state.collection.length) {
      grid.innerHTML = '<div class="fighter-select-empty">No creatures yet — go roll some!</div>'
      return
    }

    grid.innerHTML = state.collection.map((c, i) => `
      <div class="fighter-pick-card rarity-${c.rarity}" data-idx="${i}">
        <div class="fighter-pick-sprite">${c.sprite || '?'}</div>
        <div class="fighter-pick-name">${c.nickname || c.name}</div>
        <div class="fighter-pick-level">Lv ${c.level}</div>
        <div class="fighter-pick-stats">ATK ${c.base_atk} · DEF ${c.base_def}</div>
      </div>
    `).join('')

    grid.querySelectorAll('.fighter-pick-card').forEach(card => {
      card.addEventListener('click', () => {
        confirmFighter(state.collection[parseInt(card.dataset.idx)])
      })
    })
  }

  window.refreshBattleSelectGrid = renderSelectGrid

  function confirmFighter(creature) {
    battleState.yourFighter = creature
    battleState.yourHp = creature.base_hp

    el('fighter-select-panel')?.classList.add('hidden')
    el('fighter-you')?.classList.remove('hidden', 'defeated')
    el('fighter-you')?.classList.remove('defeated')

    el('you-sprite').textContent = creature.sprite || '?'
    el('you-name').textContent   = creature.nickname || creature.name
    setHpBar('you', battleState.yourHp, creature.base_hp)

    showToast(`${creature.name} is ready to fight!`)

    if (battleState.oppFighter && battleState.oppHp > 0) {
      battleState.inBattle = true
      el('btn-attack').disabled = false
    }
  }

  // ── WIRE HANDLERS ─────────────────────────────────────────
  function wireHandler(id, event, fn) {
    const node = el(id)
    if (node) node.addEventListener(event, fn)
  }

  wireHandler('btn-swap-fighter', 'click', () => {
    if (battleState.inBattle) { showToast("Can't swap mid-battle!"); return }
    battleState.yourFighter = null
    el('fighter-you')?.classList.add('hidden')
    el('fighter-select-panel')?.classList.remove('hidden')
    el('btn-attack').disabled = true
    renderSelectGrid()
  })

  wireHandler('btn-find-opponent', 'click', () => {
    const templates = getCreatureTemplates()
    if (!templates.length) { showToast('No opponents available — check DB seed.'); return }

    const template = templates[Math.floor(Math.random() * templates.length)]
    battleState.oppFighter = { ...template }
    battleState.oppHp = template.base_hp

    el('find-opponent-panel')?.classList.add('hidden')
    el('fighter-opp')?.classList.remove('hidden')
    el('fighter-opp')?.classList.remove('defeated')

    el('opp-sprite').textContent = template.sprite || '?'
    el('opp-name').textContent   = template.name
    setHpBar('opp', battleState.oppHp, template.base_hp)

    if (battleState.yourFighter && battleState.yourHp > 0) {
      battleState.inBattle = true
      el('btn-attack').disabled = false
      spawnFloat('opp', `⚔️ ${template.name} appeared!`, 'dmg-win')
    }
  })

  wireHandler('btn-attack', 'click', async () => {
    if (!battleState.inBattle || battleState.busy) return
    battleState.busy = true
    el('btn-attack').disabled = true

    const you = battleState.yourFighter
    const opp = battleState.oppFighter

    // Crit roll: 15% chance
    const isCrit = Math.random() < 0.15
    const rawDmg = calcDmg(you.base_atk, opp.base_def)
    const yourDmg = isCrit ? Math.round(rawDmg * 1.75) : rawDmg
    battleState.oppHp = Math.max(0, battleState.oppHp - yourDmg)

    spawnFloat('opp', isCrit ? `${yourDmg}!!` : `-${yourDmg}`, isCrit ? 'dmg-crit' : 'dmg-hit')
    setHpBar('opp', battleState.oppHp, opp.base_hp)

    if (battleState.oppHp <= 0) {
      await endBattle(true)
      return
    }

    // Opponent retaliates after delay
    setTimeout(async () => {
      const oppDmg = calcDmg(opp.base_atk, you.base_def)
      battleState.yourHp = Math.max(0, battleState.yourHp - oppDmg)

      spawnFloat('you', `-${oppDmg}`, 'dmg-taken')
      setHpBar('you', battleState.yourHp, you.base_hp)

      if (battleState.yourHp <= 0) {
        await endBattle(false)
        return
      }

      battleState.busy = false
      el('btn-attack').disabled = false
    }, 750)
  })

  // ── END BATTLE ────────────────────────────────────────────
  async function endBattle(won) {
    battleState.inBattle = false
    battleState.busy = false
    el('btn-attack').disabled = true

    if (won) {
      spawnFloat('opp', 'Victory! +50g', 'dmg-win')
      state.wins++
      state.currency += 50
      setTimeout(() => el('fighter-opp')?.classList.add('defeated'), 300)
    } else {
      spawnFloat('you', 'Defeated...', 'dmg-win')
      setTimeout(() => el('fighter-you')?.classList.add('defeated'), 300)
    }

    await persistProfile()
    updateUI()
    saveState()

    setTimeout(() => {
      // Reset opponent side → show Find Opponent panel
      battleState.oppFighter = null
      battleState.oppHp = 0
      el('fighter-opp')?.classList.add('hidden')
      el('find-opponent-panel')?.classList.remove('hidden')

      // On loss reset your side too
      if (!won) {
        battleState.yourFighter = null
        battleState.yourHp = 0
        el('fighter-you')?.classList.add('hidden')
        el('fighter-select-panel')?.classList.remove('hidden')
        renderSelectGrid()
      }
    }, 2200)
  }

  // ── FLOATING DAMAGE NUMBERS ───────────────────────────────
  function spawnFloat(side, text, cls) {
    const target = el(`fighter-${side}`)
    if (!target) return

    const node = document.createElement('div')
    node.className = `dmg-float ${cls}`
    node.textContent = text

    // Randomise horizontal position slightly so stacked hits don't overlap
    const offset = (Math.random() - 0.5) * 40
    node.style.left = `calc(50% + ${offset}px)`

    target.appendChild(node)
    // Remove after animation completes
    node.addEventListener('animationend', () => node.remove())
  }

  // ── HELPERS ───────────────────────────────────────────────
  function calcDmg(atk, def) {
    return Math.max(1, Math.round(atk - def * 0.4 + (Math.random() * 10 - 5)))
  }

  function setHpBar(side, current, max) {
    const pct = Math.max(0, Math.round((current / max) * 100))
    const bar = el(`${side}-hp-bar`)
    const txt = el(`${side}-hp-text`)
    if (bar) { bar.style.width = `${pct}%`; bar.className = 'hp-bar' + (pct < 30 ? ' low' : '') }
    if (txt) txt.textContent = `${current} / ${max}`
  }

  // ── INIT ─────────────────────────────────────────────────
  // Grid rendered by app.js after bootstrap() loads the collection
}
