import React, { useState, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Camera, User, Loader2, X, ImagePlus } from 'lucide-react';
import { toast } from 'sonner';
import { ImageCropDialog } from './ImageCropDialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface ProfilePictureUploadProps {
  currentPhotoURL?: string;
  userName?: string;
  onUploadComplete?: (url: string) => void;
}

export const ProfilePictureUpload: React.FC<ProfilePictureUploadProps> = ({
  currentPhotoURL,
  userName,
  onUploadComplete,
}) => {
  const { user, updateProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [previewURL, setPreviewURL] = useState<string | null>(null);
  const [cropDialogOpen, setCropDialogOpen] = useState(false);
  const [selectedImageSrc, setSelectedImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const getInitials = (name?: string) => {
    if (!name) return '';
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const processSelectedFile = (file: File) => {
    if (!user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    // Validate file size (max 10MB for cropping)
    if (file.size > 10 * 1024 * 1024) {
      toast.error('Image must be less than 10MB');
      return;
    }

    // Show crop dialog
    const objectURL = URL.createObjectURL(file);
    setSelectedImageSrc(objectURL);
    setCropDialogOpen(true);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processSelectedFile(file);

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    processSelectedFile(file);

    // Reset camera input
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    if (!user) return;

    setCropDialogOpen(false);
    setUploading(true);

    // Show preview immediately
    const previewUrl = URL.createObjectURL(croppedBlob);
    setPreviewURL(previewUrl);

    try {
      // Create a unique filename using Firebase user uid
      const filename = `${user.uid}/${Date.now()}.jpg`;
      
      // Upload to Supabase Storage
      const { data, error: uploadError } = await supabase.storage
        .from('profile-pictures')
        .upload(filename, croppedBlob, {
          cacheControl: '3600',
          upsert: true,
          contentType: 'image/jpeg'
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get the public URL
      const { data: urlData } = supabase.storage
        .from('profile-pictures')
        .getPublicUrl(data.path);

      const downloadURL = urlData.publicUrl;
      
      // Update user profile in Firestore
      await updateProfile({ photoURL: downloadURL });
      
      toast.success('Profile picture updated!');
      onUploadComplete?.(downloadURL);
    } catch (error) {
      console.error('Upload error:', error);
      toast.error('Failed to upload profile picture');
      setPreviewURL(null);
    } finally {
      setUploading(false);
      // Clean up selected image
      if (selectedImageSrc) {
        URL.revokeObjectURL(selectedImageSrc);
        setSelectedImageSrc(null);
      }
    }
  };

  const handleCropDialogClose = () => {
    setCropDialogOpen(false);
    if (selectedImageSrc) {
      URL.revokeObjectURL(selectedImageSrc);
      setSelectedImageSrc(null);
    }
  };

  const handleRemovePhoto = async () => {
    if (!user) return;
    
    setUploading(true);
    try {
      await updateProfile({ photoURL: '' });
      setPreviewURL(null);
      toast.success('Profile picture removed');
    } catch (error) {
      toast.error('Failed to remove profile picture');
    } finally {
      setUploading(false);
    }
  };

  const displayURL = previewURL || currentPhotoURL;

  return (
    <>
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <Avatar className="w-24 h-24 border-4 border-background shadow-lg">
            <AvatarImage 
              src={displayURL || undefined} 
              alt={userName}
              className="object-cover"
            />
            <AvatarFallback className="bg-primary/10 text-primary text-2xl">
              {userName ? getInitials(userName) : <User className="w-10 h-10" />}
            </AvatarFallback>
          </Avatar>
          
          {/* Upload button with dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="secondary"
                className="absolute -bottom-1 -right-1 rounded-full w-8 h-8 shadow-md"
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Camera className="w-4 h-4" />
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => cameraInputRef.current?.click()}>
                <Camera className="w-4 h-4 mr-2" />
                Take Photo
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Choose from Gallery
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Remove button - only show if there's a photo */}
          {displayURL && !uploading && (
            <Button
              size="icon"
              variant="destructive"
              className="absolute -top-1 -right-1 rounded-full w-6 h-6 shadow-md"
              onClick={handleRemovePhoto}
            >
              <X className="w-3 h-3" />
            </Button>
          )}
        </div>
        
        {/* Hidden file input for gallery */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          className="hidden"
        />
        
        {/* Hidden camera input */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="user"
          onChange={handleCameraCapture}
          className="hidden"
        />
        
        <p className="text-xs text-muted-foreground">
          Tap camera to change photo
        </p>
      </div>

      {/* Crop Dialog */}
      {selectedImageSrc && (
        <ImageCropDialog
          open={cropDialogOpen}
          onClose={handleCropDialogClose}
          imageSrc={selectedImageSrc}
          onCropComplete={handleCropComplete}
        />
      )}
    </>
  );
};
