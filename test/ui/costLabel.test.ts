import { describe, expect, it } from 'vitest';
import { costLabelPos } from '../../ui/src/costLabel';

describe('costLabelPos', () => {
  it('pins the label to the track start when there is no fill', () => {
    expect(costLabelPos(0)).toEqual({ left: '0%', transform: 'none' });
  });

  it('keeps a near-zero spend on the track instead of pushing it off the left edge', () => {
    // $0.003 of a $3 budget: the old right-aligned label sat entirely left of the track
    expect(costLabelPos(0.1)).toEqual({ left: '0%', transform: 'none' });
    expect(costLabelPos(11.9)).toEqual({ left: '0%', transform: 'none' });
  });

  it('right-aligns the label to the fill end once the fill can hold it', () => {
    expect(costLabelPos(12)).toEqual({ left: '12%', transform: 'translateX(-100%)' });
    expect(costLabelPos(64)).toEqual({ left: '64%', transform: 'translateX(-100%)' });
    expect(costLabelPos(100)).toEqual({ left: '100%', transform: 'translateX(-100%)' });
  });
});
