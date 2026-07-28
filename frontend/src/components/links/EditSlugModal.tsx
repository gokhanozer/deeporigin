'use client';

/**
 * Slug editor.
 *
 * Implements the "allow users to modify the slug of their URL" requirement.
 * The dialog is explicit about the consequence — changing a slug breaks every
 * copy of the old short link already in the wild — because that is not obvious
 * and is not undoable once the old slug is taken by someone else.
 */

import { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { Alert } from '../ui/Feedback';
import { useAsyncAction } from '../../hooks/useAsync';
import { updateLink } from '../../lib/api/links';
import { validateSlug } from '../../lib/validators';
import type { Link } from '../../lib/types';

export interface EditSlugModalProps {
  /** The link being edited, or `null` when the dialog is closed. */
  link: Link | null;
  open: boolean;
  onClose: () => void;
  /** Called with the updated link after a successful save. */
  onSaved: (updated: Link) => void;
}

/**
 * Renders the edit-slug dialog.
 *
 * @param props Dialog state and callbacks.
 * @returns The dialog element.
 */
export function EditSlugModal({
  link,
  open,
  onClose,
  onSaved,
}: EditSlugModalProps): React.JSX.Element {
  const [slug, setSlug] = useState('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const { run: save, pending, error: saveError, reset } = useAsyncAction(updateLink);

  // Re-seed the field whenever a different link is opened, so the dialog never
  // shows a stale value from the previously edited row.
  useEffect(() => {
    if (link) {
      setSlug(link.slug);
      setValidationError(null);
      reset();
    }
  }, [link, reset]);

  /** Validates and persists the new slug. */
  const handleSave = async (): Promise<void> => {
    if (!link) return;

    const trimmed = slug.trim();
    if (trimmed === link.slug) {
      // Nothing changed — close without a pointless request.
      onClose();
      return;
    }

    const check = validateSlug(trimmed);
    if (!check.valid) {
      setValidationError(check.reason ?? 'Invalid slug');
      return;
    }

    const updated = await save(link.id, { slug: trimmed });
    if (updated) {
      onSaved(updated);
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit short link"
      description="Choose a new slug for this link."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={handleSave} loading={pending}>
            Save changes
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Input
          label="Slug"
          value={slug}
          onChange={(event) => {
            setSlug(event.target.value);
            if (validationError) setValidationError(null);
          }}
          onKeyDown={(event) => {
            // Enter saves, which is what a single-field dialog should do.
            if (event.key === 'Enter') void handleSave();
          }}
          error={validationError ?? saveError}
          hint="Letters, numbers, hyphens and underscores"
        />

        <Alert variant="warning">
          Changing the slug breaks the previous short URL. Anyone who already has
          the old link will get a 404.
        </Alert>
      </div>
    </Modal>
  );
}
