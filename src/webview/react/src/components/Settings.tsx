import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  IconButton,
  FormControlLabel,
  Switch,
  Box
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import { useVSCode } from '../context/VSCodeContext';

interface Settings {
  server: string;
  token: string;
  stream: boolean;
}

const Settings: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({
    server: '',
    token: '',
    stream: false
  });
  const { getState, setState } = useVSCode();

  useEffect(() => {
    const savedState = getState();
    if (savedState) {
      setSettings({
        server: savedState.server || '',
        token: savedState.token || '',
        stream: savedState.stream || false
      });
    }
  }, []);

  const handleOpen = () => setOpen(true);
  const handleClose = () => setOpen(false);

  const handleSave = () => {
    setState(settings);
    handleClose();
  };

  const isValid = settings.server.trim().length > 0;

  return (
    <>
      <Box sx={{ position: 'fixed', top: 16, right: 16, zIndex: 1000 }}>
        <IconButton
          onClick={handleOpen}
          color="primary"
          sx={{
            backgroundColor: 'background.paper',
            '&:hover': { backgroundColor: 'background.default' }
          }}
        >
          <SettingsIcon />
        </IconButton>
      </Box>

      <Dialog open={open} onClose={handleClose}>
        <DialogTitle>Settings</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Server URL"
            type="text"
            fullWidth
            value={settings.server}
            onChange={(e) => setSettings({ ...settings, server: e.target.value })}
            error={!isValid}
            helperText={!isValid ? "Server URL is required" : ""}
          />
          <TextField
            margin="dense"
            label="API Token"
            type="password"
            fullWidth
            value={settings.token}
            onChange={(e) => setSettings({ ...settings, token: e.target.value })}
          />
          <FormControlLabel
            control={
              <Switch
                checked={settings.stream}
                onChange={(e) => setSettings({ ...settings, stream: e.target.checked })}
              />
            }
            label="Enable Streaming"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!isValid}>
            Save
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default Settings; 