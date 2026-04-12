use crate::config::MAX_NATIVE_MESSAGE_SIZE;
use crate::error::{BridgeError, Result};
use std::io::{Read, Write};

/// Read one native messaging frame: 4-byte LE length prefix + JSON.
/// Returns None on EOF.
pub fn read_message(stdin: &mut impl Read) -> Result<Option<serde_json::Value>> {
    let mut len_buf = [0u8; 4];
    match stdin.read_exact(&mut len_buf) {
        Ok(()) => {}
        Err(e) if e.kind() == std::io::ErrorKind::UnexpectedEof => return Ok(None),
        Err(e) => return Err(e.into()),
    }

    let len = u32::from_le_bytes(len_buf);
    if len > MAX_NATIVE_MESSAGE_SIZE {
        return Err(BridgeError::MessageTooLarge(len));
    }

    let mut buf = vec![0u8; len as usize];
    stdin.read_exact(&mut buf)?;

    Ok(Some(serde_json::from_slice(&buf)?))
}

/// Write one native messaging frame: 4-byte LE length prefix + JSON.
pub fn write_message(stdout: &mut impl Write, msg: &serde_json::Value) -> Result<()> {
    let json = serde_json::to_vec(msg)?;
    let len = json.len() as u32;
    stdout.write_all(&len.to_le_bytes())?;
    stdout.write_all(&json)?;
    stdout.flush()?;
    Ok(())
}
