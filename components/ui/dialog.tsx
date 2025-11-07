'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as React from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Overlay>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>>(\
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn('fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out', className)}
      {...props}
    />
  )
);
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Content>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>>(\
  ({ className, children, ...props }, ref) => (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xl duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out',
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-full p-1 text-slate-500 hover:bg-slate-100">
          <X className="h-4 w-4" />
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
);
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);

const DialogTitle = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Title>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>>(\
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Title ref={ref} className={cn('text-lg font-semibold text-slate-900', className)} {...props} />
  )
);
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<React.ElementRef<typeof DialogPrimitive.Description>, React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>>(\
  ({ className, ...props }, ref) => (
    <DialogPrimitive.Description ref={ref} className={cn('text-sm text-slate-600', className)} {...props} />
  )
);
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export { Dialog, DialogTrigger, DialogContent, DialogOverlay, DialogClose, DialogHeader, DialogTitle, DialogDescription };
