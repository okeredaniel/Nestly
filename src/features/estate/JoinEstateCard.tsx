import { useEffect, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import BottomCard, { SheetSuccess, SheetTitle } from '../../components/ui/BottomCard';
import AppTextField from '../../components/ui/AppTextField';
import PrimaryButton from '../../components/ui/PrimaryButton';
import { colors, typography } from '../../theme';
import { friendlyEstateError, requestToJoin } from './estateService';

type Props = { visible: boolean; onClose: () => void };
type Errors = { code?: string; unit?: string; form?: string };

export default function JoinEstateCard({ visible, onClose }: Props) {
  const [code, setCode] = useState('');
  const [unit, setUnit] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (visible) return;
    const t = setTimeout(() => {
      setCode('');
      setUnit('');
      setErrors({});
      setLoading(false);
      setSent(false);
    }, 300);
    return () => clearTimeout(t);
  }, [visible]);

  const submit = async () => {
    const e: Errors = {};
    if (!/^[A-Z0-9-]{4,12}$/.test(code.trim().toUpperCase())) {
      e.code = 'Enter the estate code your admin shared with you';
    }
    if (!/^\d+$/.test(unit.trim())) {
      e.unit = 'Enter only numbers for your unit or house number';
    }
    setErrors(e);
    if (Object.keys(e).length > 0) return;

    setLoading(true);
    try {
      await requestToJoin(code, unit.trim());
      setSent(true);
    } catch (err: any) {
      if (err?.message === 'estate-not-found') setErrors({ code: friendlyEstateError(err) });
      else setErrors({ form: friendlyEstateError(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <BottomCard visible={visible} onClose={onClose}>
      {sent ? (
        <SheetSuccess
          icon="time-outline"
          title="Request sent"
          text="Your estate admin will review your request. You'll be let in as soon as it's approved."
        >
          <PrimaryButton title="Got it" onPress={onClose} style={{ alignSelf: 'stretch' }} />
        </SheetSuccess>
      ) : (
        <>
          <SheetTitle
            title="Join your estate"
            subtitle="Sign up as a resident using your estate's invite code."
          />
          <AppTextField
            label="Estate code"
            value={code}
            onChangeText={setCode}
            placeholder="e.g. NST-7K4P9"
            autoCapitalize="characters"
            autoCorrect={false}
            error={errors.code}
          />
          <AppTextField
            label="Unit or house number"
            value={unit}
            onChangeText={(text) => setUnit(text.replace(/\D/g, ''))}
            placeholder="e.g. 12"
            keyboardType="numeric"
            inputMode="numeric"
            maxLength={8}
            error={errors.unit}
          />
          {!!errors.form && <Text style={styles.formError}>{errors.form}</Text>}
          <PrimaryButton
            title="Request to join"
            onPress={submit}
            loading={loading}
            style={{ marginBottom: 8 }}
          />
        </>
      )}
    </BottomCard>
  );
}

const styles = StyleSheet.create({
  formError: {
    ...typography.caption,
    color: colors.danger,
    textAlign: 'center',
    marginBottom: 10,
  },
});
