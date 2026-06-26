import Svg, {
  Circle,
  ClipPath,
  Defs,
  G,
  Line,
  Rect,
} from 'react-native-svg';
import { Language } from '@/store/useSettings';

// Flags drawn as SVG so they render identically on Android and iOS
// (regional-indicator emoji flags don't render on stock Android).

const W = 30;
const H = 20;
const R = 4;

interface Props {
  code: Language;
  width?: number;
}

export function Flag({ code, width = 26 }: Props) {
  const height = (width * H) / W;
  return (
    <Svg width={width} height={height} viewBox={`0 0 ${W} ${H}`}>
      <Defs>
        <ClipPath id="round">
          <Rect x="0" y="0" width={W} height={H} rx={R} ry={R} />
        </ClipPath>
      </Defs>
      <G clipPath="url(#round)">{renderFlag(code)}</G>
      <Rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={R}
        ry={R}
        fill="none"
        stroke="rgba(0,0,0,0.18)"
        strokeWidth={1}
      />
    </Svg>
  );
}

function renderFlag(code: Language) {
  switch (code) {
    case 'it':
      return (
        <>
          <Rect x={0} y={0} width={10} height={H} fill="#009246" />
          <Rect x={10} y={0} width={10} height={H} fill="#ffffff" />
          <Rect x={20} y={0} width={10} height={H} fill="#ce2b37" />
        </>
      );
    case 'fr':
      return (
        <>
          <Rect x={0} y={0} width={10} height={H} fill="#0055A4" />
          <Rect x={10} y={0} width={10} height={H} fill="#ffffff" />
          <Rect x={20} y={0} width={10} height={H} fill="#EF4135" />
        </>
      );
    case 'de':
      return (
        <>
          <Rect x={0} y={0} width={W} height={H / 3} fill="#000000" />
          <Rect x={0} y={H / 3} width={W} height={H / 3} fill="#DD0000" />
          <Rect x={0} y={(2 * H) / 3} width={W} height={H / 3} fill="#FFCE00" />
        </>
      );
    case 'es':
      return (
        <>
          <Rect x={0} y={0} width={W} height={H} fill="#AA151B" />
          <Rect x={0} y={H / 4} width={W} height={H / 2} fill="#F1BF00" />
        </>
      );
    case 'pt':
      return (
        <>
          <Rect x={0} y={0} width={12} height={H} fill="#006600" />
          <Rect x={12} y={0} width={18} height={H} fill="#FF0000" />
          <Circle cx={12} cy={H / 2} r={3.4} fill="#FFD700" />
          <Circle cx={12} cy={H / 2} r={1.6} fill="#FF0000" />
        </>
      );
    case 'en':
      // Union Jack (approximate but recognizable)
      return (
        <>
          <Rect x={0} y={0} width={W} height={H} fill="#012169" />
          {/* white diagonals */}
          <Line x1={0} y1={0} x2={W} y2={H} stroke="#ffffff" strokeWidth={5} />
          <Line x1={W} y1={0} x2={0} y2={H} stroke="#ffffff" strokeWidth={5} />
          {/* red diagonals */}
          <Line x1={0} y1={0} x2={W} y2={H} stroke="#C8102E" strokeWidth={2} />
          <Line x1={W} y1={0} x2={0} y2={H} stroke="#C8102E" strokeWidth={2} />
          {/* white cross */}
          <Rect x={W / 2 - 4} y={0} width={8} height={H} fill="#ffffff" />
          <Rect x={0} y={H / 2 - 4} width={W} height={8} fill="#ffffff" />
          {/* red cross */}
          <Rect x={W / 2 - 2.5} y={0} width={5} height={H} fill="#C8102E" />
          <Rect x={0} y={H / 2 - 2.5} width={W} height={5} fill="#C8102E" />
        </>
      );
    case 'system':
    default:
      // A simple globe for "Automatic"
      return (
        <>
          <Rect x={0} y={0} width={W} height={H} fill="#3b82f6" />
          <Circle cx={W / 2} cy={H / 2} r={7} fill="none" stroke="#ffffff" strokeWidth={1.4} />
          <Line x1={W / 2 - 7} y1={H / 2} x2={W / 2 + 7} y2={H / 2} stroke="#ffffff" strokeWidth={1.2} />
          <Line x1={W / 2} y1={H / 2 - 7} x2={W / 2} y2={H / 2 + 7} stroke="#ffffff" strokeWidth={1.2} />
          <Circle cx={W / 2} cy={H / 2} r={3} fill="none" stroke="#ffffff" strokeWidth={1.1} />
        </>
      );
  }
}
