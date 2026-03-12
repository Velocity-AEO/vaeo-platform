/**
 * apps/dashboard/lib/strip_component_logic.ts
 *
 * Pure logic for the viewport screenshot strip component. Never throws.
 */

// ── getTabClasses ────────────────────────────────────────────────────────────

export function getTabClasses(tab_name: string, active_name: string): string {
  try {
    if (tab_name === active_name) {
      return 'px-3 py-1.5 rounded-md text-sm font-medium bg-blue-600 text-white';
    }
    return 'px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors';
  } catch {
    return 'px-3 py-1.5 rounded-md text-sm font-medium bg-gray-100 text-gray-600';
  }
}

// ── getCleanIndicator ────────────────────────────────────────────────────────

export function getCleanIndicator(clean: boolean): {
  icon: string;
  color: string;
  label: string;
} {
  try {
    if (clean) {
      return { icon: '✓', color: 'text-green-600', label: 'All viewports clean' };
    }
    return { icon: '✗', color: 'text-red-600', label: 'Viewport issues detected' };
  } catch {
    return { icon: '✗', color: 'text-red-600', label: 'Viewport issues detected' };
  }
}
