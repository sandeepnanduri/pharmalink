'use client';

/**
 * A submit button that asks for confirmation before it lets the form post.
 * Used for irreversible actions (withdraw RFQ, decline) so a mis-click doesn't
 * notify every supplier or kill a live request.
 */
export function ConfirmSubmit({
  label,
  confirm,
  className = 'btn-ghost',
  testId,
}: {
  label: string;
  confirm: string;
  className?: string;
  testId?: string;
}) {
  return (
    <button
      type="submit"
      className={className}
      data-testid={testId}
      onClick={(e) => {
        if (!window.confirm(confirm)) e.preventDefault();
      }}
    >
      {label}
    </button>
  );
}
