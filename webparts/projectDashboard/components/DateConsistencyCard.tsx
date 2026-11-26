import * as React from 'react';
import { IParentSpanCheck } from '../utils/TaskDateConsistency';
import styles from './DateConsistencyCard.module.scss';

export interface IDateConsistencyCardProps {
  check: IParentSpanCheck;
  parentLabel: string;
  childLabel: string;
  onApplyParent: () => void;
  /** Omitted when the parent has not moved and no child is outside its span */
  onShiftChildren?: () => void;
}

const fmt = (ymd: string): string => {
  const [y, m, d] = ymd.split('-');
  return y && m && d ? `${Number(m)}/${Number(d)}/${y.slice(-2)}` : '—';
};

const DateConsistencyCard: React.FC<IDateConsistencyCardProps> = ({ check, parentLabel, childLabel, onApplyParent, onShiftChildren }) => {
  const [dismissedKey, setDismissedKey] = React.useState('');
  const key = `${check.expected.start}|${check.expected.finish}`;
  if (check.inSync || dismissedKey === key) return null;

  return (
    <div className={styles.card}>
      <span className={styles.message}>
        ⚠ {parentLabel} dates out of sync with {childLabel} — expected {fmt(check.expected.start)} – {fmt(check.expected.finish)}
      </span>
      <div className={styles.actions}>
        <button type="button" className={styles.applyBtn} onClick={onApplyParent}>Apply to {parentLabel.toLowerCase()}</button>
        {onShiftChildren && (
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={onShiftChildren}
            title={`Move ${childLabel} by the working days the ${parentLabel.toLowerCase()} moved (Mon–Fri); ${childLabel} ending after its finish are pulled back`}
          >Shift {childLabel} with {parentLabel.toLowerCase()}</button>
        )}
        <button type="button" className={styles.dismissBtn} onClick={() => setDismissedKey(key)} title="Dismiss">✕</button>
      </div>
    </div>
  );
};

export default DateConsistencyCard;
