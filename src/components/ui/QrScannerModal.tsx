import { useEffect, useRef } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';

type Props = { visible: boolean; onClose: () => void; onScan: (data: string) => void };

export default function QrScannerModal({ visible, onClose, onScan }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const handled = useRef(false);

  useEffect(() => {
    if (!visible) return;
    handled.current = false;
    if (permission && !permission.granted && permission.canAskAgain) requestPermission();
  }, [visible, permission, requestPermission]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={s.wrap}>
        {permission?.granted ? (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={({ data }) => {
              if (handled.current) return; // fires repeatedly, only take the first
              handled.current = true;
              onScan(data);
            }}
          />
        ) : (
          <View style={s.center}>
            <Text style={s.msg}>
              {permission?.canAskAgain === false
                ? 'Camera access is blocked. Enable it in your phone settings.'
                : 'Camera permission is needed to scan passes.'}
            </Text>
          </View>
        )}

        <View style={s.frame} pointerEvents="none" />
        <Text style={s.hint}>Point at the visitor's QR code</Text>

        <Pressable onPress={onClose} style={s.close} accessibilityLabel="Close scanner">
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  msg: { color: '#fff', textAlign: 'center', fontSize: 15 },
  frame: { position: 'absolute', top: '30%', alignSelf: 'center', width: 240, height: 240, borderRadius: 28, borderWidth: 3, borderColor: '#fff' },
  hint: { position: 'absolute', bottom: 120, alignSelf: 'center', color: '#fff', fontWeight: '700' },
  close: { position: 'absolute', top: 56, right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
});
