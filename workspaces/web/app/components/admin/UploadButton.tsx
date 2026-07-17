import { useRef } from 'react';
import { UploadIcon } from 'lucide-react';
import { Button } from '~/components/ui/button';

export function UploadButton({
	disabled,
	onUpload
}: {
	disabled: boolean;
	onUpload: (file: File) => Promise<void>;
}) {
	const input = useRef<HTMLInputElement>(null);

	return (
		<>
			<input
				ref={input}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={async (event) => {
					const file = event.target.files?.[0];
					if (!file) return;
					// Reset so re-picking the same file after a failed upload still
					// fires a change event.
					event.target.value = '';
					await onUpload(file);
				}}
			/>
			<Button variant="outline" disabled={disabled} onClick={() => input.current?.click()}>
				<UploadIcon data-icon="inline-start" />
				Upload photo
			</Button>
		</>
	);
}
