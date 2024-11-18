import { useTheme } from '../theme/ThemeProvider';
import { DarkModeSwitch } from 'react-toggle-dark-mode';
import { Button } from '../ui/button';

const DarkModeToggle = () => {
  const { theme, setTheme } = useTheme();
  const checked = theme === 'dark';
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={() => setTheme(!checked ? 'dark' : 'light')}
    >
      <DarkModeSwitch checked={checked} onChange={() => {}} size={20} />
    </Button>
  );
};

export default DarkModeToggle;
