export function rarityColor(rarity) {
  return {
    legendary: 'var(--gold)',
    rare: 'var(--rare)',
    uncommon: 'var(--accent)',
    common: 'var(--muted)',
  }[rarity] || 'var(--muted)'
}