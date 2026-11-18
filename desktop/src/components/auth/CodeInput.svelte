<script lang="ts">
  /** Campo de código de 6 dígitos (verificar correo, restablecer contraseña). */
  export let id: string;
  export let label = 'Código';
  export let value = '';
</script>

<div class="form-group">
  <label for={id}>{label}</label>
  <input
    class="input code"
    {id}
    type="text"
    inputmode="numeric"
    autocomplete="one-time-code"
    pattern={'[0-9]{6}'}
    maxlength="6"
    required
    bind:value
    placeholder="123456"
  />
</div>

<style>
  .code {
    font-family: ui-monospace, 'Cascadia Code', monospace;
    font-size: var(--text-subheading);
    letter-spacing: 0.3em;
    text-align: center;
  }
</style>
