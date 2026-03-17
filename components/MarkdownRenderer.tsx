const parseBold = (text: string) => {
  const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
  return parts.map((part, index) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return (
        <strong key={index} className='font-bold text-ink'>
          {part.slice(2, -2)}
        </strong>
      );
    }

    if (part.startsWith('*') && part.endsWith('*')) {
      return (
        <em key={index} className='italic text-bronze'>
          {part.slice(1, -1)}
        </em>
      );
    }

    if (part.startsWith('`') && part.endsWith('`')) {
      return (
        <code key={index} className='bg-bronze/10 px-1 rounded text-xs'>
          {part.slice(1, -1)}
        </code>
      );
    }

    return <span key={index}>{part}</span>;
  });
};

const MarkdownRenderer = ({ content }: { content: string }) => {
  if (!content) {
    return null;
  }

  const normalized = content.replace(/^(#{1,6}\s)/gm, '\n$1');
  const blocks = normalized.split('\n');

  return (
    <div className='space-y-3 text-ink/90 leading-relaxed text-justify'>
      {blocks.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return null;
        }

        if (trimmed.startsWith('### ')) {
          return (
            <h3
              key={idx}
              className='text-sm font-bold text-vermilion border-b border-vermilion/20 pb-1 mt-4'
            >
              {parseBold(trimmed.replace(/^###\s+/, ''))}
            </h3>
          );
        }

        if (trimmed.startsWith('## ')) {
          return (
            <h2 key={idx} className='text-base font-bold text-ink mt-4 mb-2'>
              {parseBold(trimmed.replace(/^##\s+/, ''))}
            </h2>
          );
        }

        if (trimmed.startsWith('# ')) {
          return (
            <h1 key={idx} className='text-lg font-bold text-ink mt-4 mb-2 text-center'>
              {parseBold(trimmed.replace(/^#\s+/, ''))}
            </h1>
          );
        }

        if (trimmed.match(/^[-*]\s/)) {
          return (
            <div key={idx} className='flex gap-2 ml-2'>
              <span className='text-bronze font-bold'>•</span>
              <span>{parseBold(trimmed.replace(/^[-*]\s+/, ''))}</span>
            </div>
          );
        }

        if (trimmed.match(/^\d+\.\s/)) {
          const num = trimmed.match(/^\d+/)?.[0];
          return (
            <div key={idx} className='flex gap-2 ml-2'>
              <span className='text-bronze font-bold'>{num}.</span>
              <span>{parseBold(trimmed.replace(/^\d+\.\s+/, ''))}</span>
            </div>
          );
        }

        return (
          <p key={idx} className='indent-4'>
            {parseBold(trimmed)}
          </p>
        );
      })}
    </div>
  );
};

export default MarkdownRenderer;
