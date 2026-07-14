export function applyArmor(baseDamage, enemyStats, attackerStats = {}) {
  const armor = enemyStats?.armor || 0;
  const pierce = attackerStats?.armorPierce || 0;
  return Math.max(1, baseDamage - Math.max(0, armor - pierce));
}
