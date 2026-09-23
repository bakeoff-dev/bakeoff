import { T } from '../theme';

/**
 * The model under an agent's name, in the handoff's muted label style. `indent` aligns it
 * with the name rather than the identity dot; callers pass dot width + row gap.
 */
export const ModelLine = ({ text, size = 12, indent = 0 }: { text: string; size?: 12 | 13; indent?: number }) => (
  <span
    style={{
      fontSize: size, fontWeight: 500, color: T.muted, paddingLeft: indent,
      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
    }}
  >
    {text}
  </span>
);
