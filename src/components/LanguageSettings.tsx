import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Globe } from 'lucide-react';
import { useLanguage, Language } from '@/contexts/LanguageContext';

export const LanguageSettings: React.FC = () => {
  const { language, setLanguage, t } = useLanguage();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          {t('settings.language')}
        </CardTitle>
        <CardDescription>{t('settings.languageDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        <RadioGroup
          value={language}
          onValueChange={(value) => setLanguage(value as Language)}
          className="space-y-3"
        >
          <div 
            className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
              language === 'en' 
                ? 'bg-primary/10 border border-primary/30' 
                : 'bg-secondary/50 hover:bg-secondary'
            }`}
            onClick={() => setLanguage('en')}
          >
            <RadioGroupItem value="en" id="lang-en" />
            <Label htmlFor="lang-en" className="flex-1 cursor-pointer">
              <span className="font-medium">{t('settings.english')}</span>
              <p className="text-sm text-muted-foreground">English language</p>
            </Label>
            <span className="text-2xl">🇺🇸</span>
          </div>

          <div 
            className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
              language === 'bn' 
                ? 'bg-primary/10 border border-primary/30' 
                : 'bg-secondary/50 hover:bg-secondary'
            }`}
            onClick={() => setLanguage('bn')}
          >
            <RadioGroupItem value="bn" id="lang-bn" />
            <Label htmlFor="lang-bn" className="flex-1 cursor-pointer">
              <span className="font-medium">{t('settings.bangla')}</span>
              <p className="text-sm text-muted-foreground">বাংলা ভাষা</p>
            </Label>
            <span className="text-2xl">🇧🇩</span>
          </div>
        </RadioGroup>
      </CardContent>
    </Card>
  );
};
