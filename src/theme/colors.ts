export const colors = {
  primary: '#6C47FF',
  primaryDark: '#4B2FCC',
  primarySoft: '#EFEAFF',

  background: '#F8F7FC',
  surface: '#FFFFFF',

  text: '#16122B',
  textMuted: '#6E6A85',
  textOnPrimary: '#FFFFFF',

  border: '#E8E5F2',

  success: '#16A34A',
  successSoft: '#E8F6EC',
  warning: '#D97706',
  warningSoft: '#FEF3E2',
  danger: '#DC2626',
  dangerSoft: '#FDECEC',
  info: '#2563EB',
  infoSoft: '#E8EFFD',
};

// Pass status colors: pending / active / used / expired
export const statusColors = {
  pending: { text: colors.warning, bg: colors.warningSoft },
  active: { text: colors.success, bg: colors.successSoft },
  used: { text: colors.textMuted, bg: '#F0F1F3' },
  expired: { text: colors.danger, bg: colors.dangerSoft },
};