import React from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { X } from 'lucide-react';

interface ProfilePictureDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  imageUrl: string | null | undefined;
  name?: string;
}

export const ProfilePictureDialog = ({
  open,
  onOpenChange,
  imageUrl,
  name = 'Profile Picture',
}: ProfilePictureDialogProps) => {
  if (!imageUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-transparent border-none shadow-none">
        <button
          onClick={() => onOpenChange(false)}
          className="absolute right-2 top-2 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70 transition-colors"
        >
          <X className="h-5 w-5" />
          <span className="sr-only">Close</span>
        </button>
        <div className="relative w-full aspect-square rounded-xl overflow-hidden">
          <img
            src={imageUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};
