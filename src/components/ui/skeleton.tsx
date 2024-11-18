import { cn } from '@/lib/utils';
import { cloneElement, isValidElement } from 'react';

interface Props extends React.HTMLAttributes<HTMLDivElement> {
  loading?: boolean;
}

function Skeleton({ className, loading = true, ...props }: Props) {
  return (
    <div
      className={cn(
        'rounded-md',
        loading
          ? 'animate-pulse bg-muted'
          : 'bg-transparent transition-colors duration-500',
        className
      )}
      {...props}
    >
      {isValidElement(props.children)
        ? cloneElement(props.children, {
            // eslint-disable-next-line @typescript-eslint/ban-ts-comment
            // @ts-ignore - ts issue i dont care about
            className: loading
              ? 'opacity-0'
              : 'transition-opacity duration-500',
          })
        : props.children}
    </div>
  );
}

export { Skeleton };
