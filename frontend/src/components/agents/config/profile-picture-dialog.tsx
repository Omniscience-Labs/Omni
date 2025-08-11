'use client';

import React, { useState } from 'react';
import { Upload, Link2, X, Image as ImageIcon } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { toast } from 'sonner';
import { createClient } from '@/lib/supabase/client';

interface ProfilePictureDialogProps {
  isOpen: boolean;
  onClose: () => void;
  currentImageUrl?: string;
  agentName: string;
  onImageUpdate: (url: string | null) => void;
}

export function ProfilePictureDialog({
  isOpen,
  onClose,
  currentImageUrl,
  agentName,
  onImageUpdate,
}: ProfilePictureDialogProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [isUrlSubmitting, setIsUrlSubmitting] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) { // 5MB limit
      toast.error('File size must be less than 5MB');
      return;
    }

    setIsUploading(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        toast.error('You must be logged in to upload images');
        return;
      }
      
      const form = new FormData();
      form.append('file', file);
      
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/agents/profile-image/upload`, {
        method: 'POST',
        body: form,
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        }
      });
      
      if (!res.ok) {
        const error = await res.json().catch(() => ({ message: 'Upload failed' }));
        throw new Error(error.message || 'Upload failed');
      }
      
      const data = await res.json();
      if (data?.url) {
        onImageUpdate(data.url);
        toast.success('Profile image uploaded successfully!');
        onClose();
      }
    } catch (err) {
      console.error('Upload error:', err);
      toast.error(err instanceof Error ? err.message : 'Failed to upload image');
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
    // Reset input
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const handleUrlSubmit = async () => {
    if (!customUrl.trim()) {
      toast.error('Please enter a valid URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(customUrl);
    } catch {
      toast.error('Please enter a valid URL');
      return;
    }

    setIsUrlSubmitting(true);
    try {
      onImageUpdate(customUrl);
      toast.success('Profile image URL updated successfully!');
      onClose();
    } catch (err) {
      toast.error('Failed to update profile image URL');
    } finally {
      setIsUrlSubmitting(false);
    }
  };

  const handleUrlPreview = () => {
    if (customUrl) {
      try {
        new URL(customUrl);
        setPreviewUrl(customUrl);
      } catch {
        toast.error('Please enter a valid URL');
      }
    }
  };

  const handleRemoveImage = () => {
    onImageUpdate(null);
    toast.success('Profile image removed');
    onClose();
  };

  const handleClose = () => {
    setCustomUrl('');
    setPreviewUrl(null);
    setDragActive(false);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Update Profile Picture</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 mt-4">
          <div className="flex flex-col items-center space-y-3">
            <Avatar className="h-20 w-20 rounded-xl ring-1 ring-border">
              {currentImageUrl ? (
                <AvatarImage src={currentImageUrl} alt={agentName} />
              ) : (
                <AvatarFallback className="rounded-xl">
                  <ImageIcon className="h-8 w-8 text-muted-foreground" />
                </AvatarFallback>
              )}
            </Avatar>
            <p className="text-sm text-muted-foreground text-center">
              Current profile picture for <span className="font-medium">{agentName}</span>
            </p>
          </div>

          <Tabs defaultValue="upload" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="upload" className="flex items-center gap-2">
                <Upload className="h-4 w-4" />
                Upload File
              </TabsTrigger>
              <TabsTrigger value="url" className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                Custom URL
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="upload" className="space-y-4 mt-4">
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  dragActive 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted-foreground/25 hover:border-muted-foreground/50'
                }`}
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
              >
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-sm font-medium mb-2">
                  Drop an image here, or click to select
                </p>
                <p className="text-xs text-muted-foreground mb-4">
                  PNG, JPG, GIF up to 5MB
                </p>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileInputChange}
                  className="hidden"
                  id="file-upload"
                  disabled={isUploading}
                />
                <Button 
                  asChild 
                  variant="outline" 
                  disabled={isUploading}
                  className="cursor-pointer"
                >
                  <label htmlFor="file-upload">
                    {isUploading ? 'Uploading...' : 'Select File'}
                  </label>
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="url" className="space-y-4 mt-4">
              <div className="space-y-3">
                <Label htmlFor="image-url">Image URL</Label>
                <Input
                  id="image-url"
                  type="url"
                  placeholder="https://example.com/image.png"
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  onBlur={handleUrlPreview}
                />
                
                {previewUrl && (
                  <div className="flex items-center justify-center p-4 border rounded-lg">
                    <Avatar className="h-16 w-16 rounded-xl">
                      <AvatarImage 
                        src={previewUrl} 
                        alt="Preview"
                        onError={() => {
                          setPreviewUrl(null);
                          toast.error('Unable to load image from URL');
                        }}
                      />
                      <AvatarFallback className="rounded-xl">
                        <ImageIcon className="h-6 w-6 text-muted-foreground" />
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}
                
                <Button 
                  onClick={handleUrlSubmit}
                  disabled={!customUrl.trim() || isUrlSubmitting}
                  className="w-full"
                >
                  {isUrlSubmitting ? 'Updating...' : 'Update Image URL'}
                </Button>
              </div>
            </TabsContent>
          </Tabs>
          <div className="flex justify-end pt-4 gap-2">
            <Button 
              variant="outline" 
              onClick={handleRemoveImage}
              className="flex items-center gap-2"
              disabled={!currentImageUrl}
            >
              <X className="h-4 w-4" />
              Remove Image
            </Button>
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
} 