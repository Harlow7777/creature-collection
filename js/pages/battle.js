export function initializeBattlePage({ state, updateUI, persistProfile, showToast, showGoldPopup, saveState, getCreatureTemplates }) {

  const battleState = {
    yourFighter:  null,
    oppFighter:   null,
    inBattle:     false,
    busy:         false,
    yourHp:       0,
    oppHp:        0,
    pendingSwap:  false,
    // Maps creature._id (or array index as fallback) → current HP during a battle.
    // Cleared when a battle ends so each new fight starts fresh.
    creatureHpMap: {},
  }

  const el = id => document.getElementById(id)

  // ── HP MAP HELPERS ────────────────────────────────────────
  // Use _id when available (Supabase row), fall back to name as key.
  function hpKey(creature) {
    return creature._id || creature.name
  }

  // Read stored HP for a creature, defaulting to base_hp if unseen this battle.
  function storedHp(creature) {
    const key = hpKey(creature)
    if (battleState.creatureHpMap[key] === undefined) {
      battleState.creatureHpMap[key] = creature.base_hp
    }
    return battleState.creatureHpMap[key]
  }

  // Persist current HP back into the map.
  function saveHp(creature, hp) {
    battleState.creatureHpMap[hpKey(creature)] = hp
  }

  // Clear the map between battles.
  function clearHpMap() {
    battleState.creatureHpMap = {}
  }

  // ── FIGHTER SELECT PANEL ──────────────────────────────────
  function renderSelectGrid() {
    const grid = el('fighter-select-grid')
    if (!grid) return

    // Always sync the active fighter's live HP into the map before rendering
    if (battleState.yourFighter) {
      saveHp(battleState.yourFighter, battleState.yourHp)
    }

    const findOppBtn = el('btn-find-opponent')
    if (findOppBtn) findOppBtn.disabled = !battleState.yourFighter

    if (!state.collection.length) {
      grid.innerHTML = '<div class="fighter-select-empty">No creatures yet — go roll some!</div>'
      return
    }

    const locked = !!battleState.oppFighter && !!battleState.yourFighter && !battleState.pendingSwap

    grid.innerHTML = state.collection.map((c, i) => {
      // Show current battle HP on each card so player can make informed swap decisions
      const currentHp = battleState.inBattle || battleState.pendingSwap
        ? (battleState.creatureHpMap[hpKey(c)] ?? c.base_hp)
        : c.base_hp
      const hpPct = Math.round((currentHp / c.base_hp) * 100)
      const hpColor = hpPct < 30 ? '#ff6060' : hpPct < 60 ? '#f59e0b' : '#4aed7a'

      return `
        <div class="fighter-pick-card rarity-${c.rarity}${locked ? ' locked' : ''}" data-idx="${i}">
          <div class="fighter-pick-sprite">${c.sprite || '?'}</div>
          <div class="fighter-pick-name">${c.nickname || c.name}</div>
          <div class="fighter-pick-level">Lv ${c.level}</div>
          <div class="fighter-pick-stats">ATK ${c.base_atk} · DEF ${c.base_def}</div>
          <div style="width:100%;height:3px;background:var(--surface);border-radius:999px;overflow:hidden;margin-top:3px;">
            <div style="height:100%;width:${hpPct}%;background:${hpColor};border-radius:999px;transition:width 0.3s;"></div>
          </div>
        </div>`
    }).join('')

    if (!locked) {
      grid.querySelectorAll('.fighter-pick-card').forEach(card => {
        card.addEventListener('click', () => {
          confirmFighter(state.collection[parseInt(card.dataset.idx)])
        })
      })
    }
  }

  window.refreshBattleSelectGrid = renderSelectGrid

  function confirmFighter(creature) {
    const wasPendingSwap = battleState.pendingSwap

    // Save outgoing fighter's current HP before switching
    if (battleState.yourFighter && wasPendingSwap) {
      saveHp(battleState.yourFighter, battleState.yourHp)
    }

    battleState.yourFighter = creature
    // Restore this creature's HP from the map (full HP if never fought this battle)
    battleState.yourHp      = storedHp(creature)
    battleState.pendingSwap = false

    el('fighter-select-panel')?.classList.add('hidden')
    el('fighter-you')?.classList.remove('hidden')
    el('fighter-you')?.classList.remove('defeated')

    el('you-sprite').textContent = creature.sprite || '?'
    el('you-name').textContent   = creature.nickname || creature.name
    setHpBar('you', battleState.yourHp, creature.base_hp)

    renderSelectGrid()

    if (wasPendingSwap) {
      showToast(`${creature.name} swapped in — ${battleState.oppFighter.name} retaliates!`)
      enemyAttack({ afterSwap: true })
    } else {
      showToast(`${creature.name} is ready to fight!`)
      el('btn-find-opponent').disabled = false
      if (battleState.oppFighter && battleState.oppHp > 0) {
        battleState.inBattle = true
        el('btn-attack').disabled       = false
        el('btn-swap-fighter').disabled = false
      }
    }
  }

  // ── DEDICATED ENEMY ATTACK FUNCTION ──────────────────────
  async function enemyAttack({ afterSwap = false } = {}) {
    battleState.busy = true
    el('btn-attack').disabled       = true
    el('btn-swap-fighter').disabled = true

    await delay(afterSwap ? 500 : 750)

    const opp    = battleState.oppFighter
    const oppDmg = calcDmg(opp.base_atk, battleState.yourFighter.base_def)
    battleState.yourHp = Math.max(0, battleState.yourHp - oppDmg)

    // Keep the HP map in sync as damage lands
    saveHp(battleState.yourFighter, battleState.yourHp)

    spawnFloat('you', `-${oppDmg}`, 'dmg-taken')
    setHpBar('you', battleState.yourHp, battleState.yourFighter.base_hp)

    if (battleState.yourHp <= 0) {
      await endBattle(false)
      return
    }

    battleState.busy     = false
    battleState.inBattle = true
    el('btn-attack').disabled       = false
    el('btn-swap-fighter').disabled = false
  }

  // ── WIRE HANDLERS ─────────────────────────────────────────
  function wireHandler(id, event, fn) {
    const node = el(id)
    if (node) node.addEventListener(event, fn)
  }

  wireHandler('btn-swap-fighter', 'click', () => {
    if (battleState.busy) { showToast('Wait for the current action!'); return }

    // Save current fighter's HP before opening the swap panel
    if (battleState.yourFighter) {
      saveHp(battleState.yourFighter, battleState.yourHp)
    }

    battleState.pendingSwap = true
    battleState.inBattle    = false
    el('btn-attack').disabled       = true
    el('btn-swap-fighter').disabled = true
    el('fighter-you')?.classList.add('hidden')
    el('fighter-select-panel')?.classList.remove('hidden')
    renderSelectGrid()
  })

  wireHandler('btn-find-opponent', 'click', () => {
    const templates = getCreatureTemplates()
    if (!templates.length) { showToast('No opponents available — check DB seed.'); return }

    const template = templates[Math.floor(Math.random() * templates.length)]
    battleState.oppFighter = { ...template }
    battleState.oppHp      = template.base_hp

    el('find-opponent-panel')?.classList.add('hidden')
    el('fighter-opp')?.classList.remove('hidden')
    el('fighter-opp')?.classList.remove('defeated')

    el('opp-sprite').textContent = template.sprite || '?'
    el('opp-name').textContent   = template.name
    setHpBar('opp', battleState.oppHp, template.base_hp)

    renderSelectGrid()

    if (battleState.yourFighter && battleState.yourHp > 0) {
      battleState.inBattle = true
      el('btn-attack').disabled       = false
      el('btn-swap-fighter').disabled = false

      // Initialise every creature's HP in the map at battle start
      // so the locked select grid always shows accurate values
      state.collection.forEach(c => {
        if (battleState.creatureHpMap[hpKey(c)] === undefined) {
          battleState.creatureHpMap[hpKey(c)] = c.base_hp
        }
      })

      spawnFloat('opp', `⚔️ ${template.name} appeared!`, 'dmg-win')
    }
  })

  wireHandler('btn-attack', 'click', async () => {
    if (!battleState.inBattle || battleState.busy) return
    battleState.busy = true
    el('btn-attack').disabled       = true
    el('btn-swap-fighter').disabled = true

    const you = battleState.yourFighter
    const opp = battleState.oppFighter

    const isCrit  = Math.random() < 0.15
    const rawDmg  = calcDmg(you.base_atk, opp.base_def)
    const yourDmg = isCrit ? Math.round(rawDmg * 1.75) : rawDmg
    battleState.oppHp = Math.max(0, battleState.oppHp - yourDmg)

    spawnFloat('opp', isCrit ? `${yourDmg}!!` : `-${yourDmg}`, isCrit ? 'dmg-crit' : 'dmg-hit')
    setHpBar('opp', battleState.oppHp, opp.base_hp)
    // Keep map in sync so the locked select grid shows current HP
    saveHp(battleState.yourFighter, battleState.yourHp)

    if (battleState.oppHp <= 0) {
      await endBattle(true)
      return
    }

    await enemyAttack({ afterSwap: false })
  })

  // ── END BATTLE ────────────────────────────────────────────
  async function endBattle(won) {
    battleState.inBattle    = false
    battleState.busy        = false
    battleState.pendingSwap = false
    el('btn-attack').disabled       = true
    el('btn-swap-fighter').disabled = true

    if (won) {
      spawnFloat('opp', 'Victory!', 'dmg-win')
      state.wins++
      state.currency += 50
      showGoldPopup(50)
      setTimeout(() => el('fighter-opp')?.classList.add('defeated'), 300)
    } else {
      spawnFloat('you', 'Defeated...', 'dmg-win')
      setTimeout(() => el('fighter-you')?.classList.add('defeated'), 300)
    }

    await persistProfile()
    updateUI()
    saveState()

    // Clear the HP map — next battle everyone starts fresh
    clearHpMap()

    setTimeout(() => {
      battleState.oppFighter = null
      battleState.oppHp      = 0
      el('fighter-opp')?.classList.add('hidden')
      el('find-opponent-panel')?.classList.remove('hidden')

      if (won) {
        // Reset active fighter to full HP for the next fight
        battleState.yourHp = battleState.yourFighter?.base_hp || 0
        setHpBar('you', battleState.yourHp, battleState.yourFighter?.base_hp || 1)
        el('fighter-you')?.classList.remove('defeated')
        renderSelectGrid()
      } else {
        battleState.yourFighter = null
        battleState.yourHp      = 0
        el('fighter-you')?.classList.add('hidden')
        el('fighter-select-panel')?.classList.remove('hidden')
        renderSelectGrid()
      }
    }, 2200)
  }

  // ── FLOATING DAMAGE ───────────────────────────────────────
  function spawnFloat(side, text, cls) {
    const target = el(`fighter-${side}`)
    if (!target) return
    const node = document.createElement('div')
    node.className = `dmg-float ${cls}`
    node.textContent = text
    node.style.left = `calc(50% + ${(Math.random() - 0.5) * 40}px)`
    target.appendChild(node)
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

  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}