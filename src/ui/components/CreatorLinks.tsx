import { Github, Linkedin, Instagram } from 'lucide-react';
export function CreatorLinks({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={'creator-socials ' + (compact ? 'compact' : '')}
      aria-label="Mihir Bhadak social profiles"
    >
      <a
        href="https://github.com/mihirbhadak"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Mihir Bhadak on GitHub"
        title="GitHub"
      >
        <Github size={16} />
        {!compact && 'GitHub'}
      </a>
      <a
        href="https://www.linkedin.com/in/mihirbhadak/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Mihir Bhadak on LinkedIn"
        title="LinkedIn"
      >
        <Linkedin size={16} />
        {!compact && 'LinkedIn'}
      </a>
      <a
        href="https://www.instagram.com/mihir_bhadak/"
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Mihir Bhadak on Instagram"
        title="Instagram"
      >
        <Instagram size={16} />
        {!compact && 'Instagram'}
      </a>
    </div>
  );
}
