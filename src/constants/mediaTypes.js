// List of all supported media types
export const MEDIA_TYPES = [
  {
    key: 'photos',
    label: 'Photos',
    color: '#3b82f6', // blue
  },
  {
    key: '3d_tours',
    label: '3D Tour',
    color: '#10b981', // green
  },
  // Add more types here as needed
];

// Helper to get color by key
export function getMediaTypeColor(key) {
  const type = MEDIA_TYPES.find(t => t.key === key);
  return type ? type.color : '#888';
}

// Helper to get label by key
export function getMediaTypeLabel(key) {
  const type = MEDIA_TYPES.find(t => t.key === key);
  return type ? type.label : key;
}
