import portrait from '../assets/mihir-bhadak.jpg';

export function CreatorAvatar() {
  return (
    <img
      className="creator-avatar"
      src={portrait}
      alt="Mihir Bhadak"
      width={64}
      height={64}
      decoding="async"
    />
  );
}
