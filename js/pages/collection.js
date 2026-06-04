import { rarityColor } from '../utils/rarity.js'

export function statBox(label, val, effective = null) {
  const boosted = effective !== null && effective !== val
  return `<div class="stat-box">
    <div class="stat-label">${label}</div>
    <div class="stat-val">${boosted
      ? `<span style="text-decoration:line-through;color:var(--muted);font-size:0.75rem;">${val}</span>
         <span style="color:var(--rare);">${effective}</span>`
      : val}
    </div>
  </div>`
}

export function renderCollection(collection) {
  const grid = document.getElementById('collection-grid')
  document.getElementById('collection-count').textContent = `${collection.length} creature${collection.length !== 1 ? 's' : ''}`

  if (collection.length === 0) {
    grid.innerHTML = `<div class="empty-state"><div class="empty-icon">🌀</div><div>No creatures yet. Head to Roll to begin your journey!</div></div>`
    return
  }

  grid.innerHTML = collection.map((uc, i) => {
    const xpPct = Math.min(100, Math.round((uc.xp / uc.evolves_at_xp) * 100))
    return `
      <div class="creature-card rarity-${uc.rarity}" data-idx="${i}" onclick="openCreatureModal(${i})">
        <div class="card-sprite">${uc.sprite}</div>
        <div class="card-name">${uc.nickname || uc.name}</div>
        <div class="card-type">${uc.type}</div>
        <div class="rarity-badge">${uc.rarity}</div>
        <div class="card-level">Lv ${uc.level}</div>
        <div class="xp-bar-wrap"><div class="xp-bar" style="width:${xpPct}%"></div></div>
      </div>`
  }).join('')
}

export function renderShowcase(collection) {
  const slots = document.getElementById('showcase-slots')
  const showcased = collection.filter(c => c.showcased)
  const rankClass = ['rank-1', 'rank-2', 'rank-3']

  slots.innerHTML = [1, 2, 3].map(rank => {
    const creature = showcased.find(x => x.showcaseSlot === rank)
    if (creature) {
        const color = rarityColor(creature.rarity)

        return `<div 
            class="showcase-slot ${rankClass[rank - 1]}" 
            onclick="openCreatureModal(${collection.indexOf(creature)})"
            style="
                border: 2px solid ${color};
                box-shadow:
                0 0 6px ${color}aa,
                0 0 14px ${color}55,
                inset 0 0 6px ${color}22;
            ">
            <div class="rank">#${rank}</div>
            <div class="showcase-sprite">${creature.sprite}</div>
            <div class="showcase-name">${creature.nickname || creature.name}</div>
            <div class="showcase-type">${creature.type}</div>
            <div class="showcase-level">Lv ${creature.level}</div>
        </div>`
    }
    return `<div class="showcase-slot empty ${rankClass[rank - 1]}" data-slot="${rank}">
      <div class="rank">#${rank}</div>
      <div style="color:var(--muted);font-size:0.85rem;font-style:italic;">Empty slot</div>
    </div>`
  }).join('')
}
