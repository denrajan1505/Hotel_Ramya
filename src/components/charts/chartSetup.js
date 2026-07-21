import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Tooltip, Legend, Filler);

export const CHART_COLORS = {
  primary: '#0a3d91',
  primaryLight: '#3d76c4',
  gold: '#d4af37',
  success: '#1fa15a',
  warning: '#f0942a',
  danger: '#e3423f',
  purple: '#8b5cf6',
  teal: '#14b8a6',
};

export const CATEGORY_COLOR_MAP = {
  Company: CHART_COLORS.primary,
  Individual: CHART_COLORS.gold,
  Portal: CHART_COLORS.purple,
  Travel: CHART_COLORS.teal,
  Unclassified: '#94a3b8',
};
