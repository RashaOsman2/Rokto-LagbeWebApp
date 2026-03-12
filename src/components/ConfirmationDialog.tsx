import React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle, XCircle, AlertTriangle } from 'lucide-react';

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'accept' | 'decline' | 'cancel' | 'danger';
  onConfirm: () => void;
  onCancel?: () => void;
}

export const ConfirmationDialog: React.FC<ConfirmationDialogProps> = ({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'accept',
  onConfirm,
  onCancel,
}) => {
  const getIcon = () => {
    switch (variant) {
      case 'accept':
        return <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-4" />;
      case 'decline':
      case 'cancel':
        return <XCircle className="w-12 h-12 text-destructive mx-auto mb-4" />;
      case 'danger':
        return <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />;
      default:
        return null;
    }
  };

  const getConfirmButtonClass = () => {
    switch (variant) {
      case 'accept':
        return 'bg-green-500 hover:bg-green-600 text-white';
      case 'decline':
      case 'cancel':
      case 'danger':
        return 'bg-destructive hover:bg-destructive/90 text-destructive-foreground';
      default:
        return '';
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader className="text-center">
          {getIcon()}
          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-center">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex-row gap-2 sm:flex-row sm:justify-center">
          <AlertDialogCancel 
            onClick={onCancel}
            className="flex-1"
          >
            {cancelLabel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={`flex-1 ${getConfirmButtonClass()}`}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
