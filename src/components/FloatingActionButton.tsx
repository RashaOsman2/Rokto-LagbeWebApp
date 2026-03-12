import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

export const FloatingActionButton: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Button
      onClick={() => navigate('/create-request')}
      className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl transition-shadow z-50"
      size="icon"
    >
      <Plus className="w-6 h-6" />
    </Button>
  );
};
