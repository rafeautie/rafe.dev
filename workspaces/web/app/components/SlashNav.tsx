import { Children, Fragment, type ReactNode } from 'react';
import { cn } from '~/lib/utils';

export function SlashNav({
	children,
	className,
	separatorClassName
}: {
	children: ReactNode;
	className?: string;
	separatorClassName?: string;
}) {
	return (
		<p className={className}>
			{Children.toArray(children).map((segment, index) => (
				<Fragment key={index}>
					{index > 0 && (
						<>
							{' '}
							<span className={cn('text-muted-foreground', separatorClassName)}>/</span>{' '}
						</>
					)}
					{segment}
				</Fragment>
			))}
		</p>
	);
}
