import { PlanAnalysis } from '../types/plan';

/**
 * Ensures all array fields in PlanAnalysis and its nested diagnostic structures
 * are guaranteed to be arrays (fallback from null/undefined), preventing any
 * 'Cannot read properties of null (reading length)' exceptions across the UI.
 */
export function sanitizePlan(plan: PlanAnalysis): PlanAnalysis {
  if (!plan) return plan;

  plan.statements = Array.isArray(plan.statements) ? plan.statements : [];
  plan.waitStats = Array.isArray(plan.waitStats) ? plan.waitStats : [];
  plan.globalWarnings = Array.isArray(plan.globalWarnings) ? plan.globalWarnings : [];
  plan.allMissingIndexes = Array.isArray(plan.allMissingIndexes) ? plan.allMissingIndexes : [];
  plan.antiPatterns = Array.isArray(plan.antiPatterns) ? plan.antiPatterns : [];

  for (const stmt of plan.statements) {
    if (!stmt) continue;
    stmt.warnings = Array.isArray(stmt.warnings) ? stmt.warnings : [];
    stmt.missingIndexes = Array.isArray(stmt.missingIndexes) ? stmt.missingIndexes : [];
  }

  if (plan.diagnostics) {
    const d = plan.diagnostics;
    d.implicitConversions = Array.isArray(d.implicitConversions) ? d.implicitConversions : [];
    d.consolidatedIndexes = Array.isArray(d.consolidatedIndexes) ? d.consolidatedIndexes : [];
    d.scalarUdfWarnings = Array.isArray(d.scalarUdfWarnings) ? d.scalarUdfWarnings : [];
    d.keyLookups = Array.isArray(d.keyLookups) ? d.keyLookups : [];
    d.spools = Array.isArray(d.spools) ? d.spools : [];
    d.missingStatistics = Array.isArray(d.missingStatistics) ? d.missingStatistics : [];
    d.parameterSniffing = Array.isArray(d.parameterSniffing) ? d.parameterSniffing : [];
    d.nonSargable = Array.isArray(d.nonSargable) ? d.nonSargable : [];
    d.rowGoals = Array.isArray(d.rowGoals) ? d.rowGoals : [];

    for (const p of d.parameterSniffing) {
      if (p) {
        p.parameters = Array.isArray(p.parameters) ? p.parameters : [];
      }
    }

    if (d.adaptive) {
      d.adaptive.adaptiveJoins = Array.isArray(d.adaptive.adaptiveJoins) ? d.adaptive.adaptiveJoins : [];
      d.adaptive.features = Array.isArray(d.adaptive.features) ? d.adaptive.features : [];
    }
  }

  if (plan.hardwareMetrics) {
    const hm = plan.hardwareMetrics;
    hm.topIoLeaders = Array.isArray(hm.topIoLeaders) ? hm.topIoLeaders : [];
    for (const leader of hm.topIoLeaders) {
      if (leader) {
        leader.accessOperations = Array.isArray(leader.accessOperations) ? leader.accessOperations : [];
        leader.indexesUsed = Array.isArray(leader.indexesUsed) ? leader.indexesUsed : [];
      }
    }
  }

  return plan;
}
