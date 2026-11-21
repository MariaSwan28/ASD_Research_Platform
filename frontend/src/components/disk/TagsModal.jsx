import React, { useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, Chip } from '@mui/material';
import Autocomplete from '@mui/material/Autocomplete';

const tagsList = ['Удары', 'Вскрики'];

const TagsModal = ({ open, onClose, onSave }) => {
  const [selectedTags, setSelectedTags] = useState([]);

  const handleSave = () => {
    onSave(selectedTags);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm" PaperProps={{ sx: { borderRadius: "24px", padding: "12px", boxShadow: "0 28px 80px rgba(21,39,70,.24)" } }}>
      <DialogTitle sx={{ fontWeight: 800, color: "#3d5662", fontSize: 23 }}>Теги материала</DialogTitle>
      <DialogContent><p style={{color:"#72819b",fontSize:13,marginTop:0}}>Отметьте особенности материала. Теги можно не выбирать.</p>
        <Autocomplete
          multiple
          options={tagsList}
          value={selectedTags}
          onChange={(_, value) => setSelectedTags(value)}
          renderTags={(value, getTagProps) => value.map((option, index) => <Chip key={option} label={option} {...getTagProps({ index })} />)}
          renderInput={(params) => <TextField {...params} label="Теги" />}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} sx={{color:"#64738b"}}>Отмена</Button>
        <Button onClick={handleSave} variant="contained" sx={{bgcolor:"#698f7b", borderRadius:"12px", textTransform:"none", px:3, "&:hover":{bgcolor:"#527969"}}}>
          Сохранить
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export { TagsModal };
