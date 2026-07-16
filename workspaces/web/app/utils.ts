export function getImageUrl(imageKey: string, width?: number) {
	const options = ['format=auto', 'quality=75'];
	if (width) options.push(`width=${width}`);
	return `https://images.rafe.dev/cdn-cgi/image/${options.join(',')}/${imageKey}`;
}
